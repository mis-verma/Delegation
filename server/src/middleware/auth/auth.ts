// 1. IMPORT STATEMENTS
// Import core types from Express to handle request, response, and middleware routing
import type { Request, Response, NextFunction } from "express";
// Import the jsonwebtoken library to verify digital signatures on incoming tokens
import jwt from 'jsonwebtoken';
// Import environment configurations (specifically your private JWT secrets)
import { env } from "../../config/index.js";
// Import your custom AppError class to trigger clean, structured error handling responses,
// plus asyncHandler so this middleware can safely `await` a DB call below
import { AppError, asyncHandler } from "../../utils/index.js";
// Import the Role type from the Drizzle schema to enforce TypeScript type safety on user roles
import type { Role } from "../../db/schema/core.js";
// DB access to re-check the user's *current* role/active-status on every request instead of
// trusting whatever was baked into the JWT at issue time (see authenticate below)
import { db } from "../../config/db.js";
import { users } from "../../db/schema/core.js";
import { eq } from "drizzle-orm";

// 2. JWT PAYLOAD TYPE DEFINITION
// Define the shape of the decoded data hidden inside the JWT access token
// 'sub' stands for Subject (usually the User's MongoDB ObjectId string)
export type AccessTokenPayload = { sub: string; role: Role; departmentId?: string; storeId?: string; iat?: number };

// The value written to User.passwordChangedAt. Cut to whole seconds on purpose: JWT `iat` has
// second precision and DATETIME(0) rounds, so keeping a fractional part could reject a token that
// was legitimately issued right after the change (e.g. the sign-in that follows a reset).
export const passwordChangeStamp = () => new Date(Math.floor(Date.now() / 1000) * 1000);

// True when this token was issued before the user's last password change.
export const tokenPredatesPasswordChange = (iat: number | undefined, passwordChangedAt: Date | null | undefined) =>
    !!passwordChangedAt && (typeof iat !== 'number' || iat < Math.floor(passwordChangedAt.getTime() / 1000));

// 3. EXPRESS REQUEST DECLARATION MERGING
// Open the global namespace scope to inject custom types into third-party libraries
declare global {
    namespace Express {
        // Merge a custom property into the existing Express Request interface
        interface Request {
            // Make 'user' an optional property so unauthenticated routes do not break
            user?: AccessTokenPayload;
        }
    }
}

// The two requests a person with a temporary password may still make: read their own profile and
// change their password (which needs the current, temporary one).
const isPasswordSetupCall = (req: Request) => {
    const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');
    return (req.method === 'GET' && path.endsWith('/users/me')) || (req.method === 'POST' && path.endsWith('/users/me/password'));
};

// 4. AUTHENTICATION MIDDLEWARE
// Middleware function to intercept requests, read headers, and validate the user's identity token
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    // Read the incoming Authorization header from the client request
    const header = req.headers.authorization;

    // Guard Clause: If the header is missing or does not start with "Bearer ", reject instantly
    if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized('Missing access token'));

    // Strip away the string "Bearer " to extract only the raw cryptographic token string
    const token = header.slice('Bearer '.length);

    let payload: AccessTokenPayload;
    try {
        // Verify the token signature using your secret key and cast the decoded object to our payload type.
        // `algorithms` is pinned to what signAccessToken actually uses (HS256, the default for a
        // plain string secret) rather than left to jsonwebtoken's default accepted set — so a
        // token signed any other way is rejected outright instead of merely "not accepted today".
        payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
    } catch {
        // If jwt.verify throws an error (expired signature, tampered token, etc.), catch it and return a 401
        return next(AppError.unauthorized('Invalid or expired access token'));
    }

    // Re-check the user's CURRENT role/active-status/department/store from the DB on every
    // request rather than trusting the JWT payload for its whole lifetime. Without this, an
    // admin demoting or deactivating a user has no effect until that user's access token
    // naturally expires — this closes that gap at the cost of one indexed primary-key lookup
    // per request (acceptable at this app's scale; there's no distributed session store like
    // Redis this app can depend on being available, so the DB is the source of truth here).
    const [currentUser] = await db.select({
        role: users.role,
        isActive: users.isActive,
        departmentId: users.departmentId,
        storeId: users.storeId,
        passwordChangedAt: users.passwordChangedAt,
        mustChangePassword: users.mustChangePassword,
    }).from(users).where(eq(users.id, payload.sub)).limit(1);

    if (!currentUser || !currentUser.isActive) {
        return next(AppError.unauthorized('Account is no longer active'));
    }
    // A password change/reset ends every access token issued before it, not just the refresh sessions.
    if (tokenPredatesPasswordChange(payload.iat, currentUser.passwordChangedAt)) {
        return next(AppError.unauthorized('Password was changed. Please sign in again.'));
    }

    // An admin set this password, so it is temporary: until the person picks their own, the only calls
    // that work are reading their own profile and changing their password.
    if (currentUser.mustChangePassword && !isPasswordSetupCall(req)) {
        return next(AppError.forbidden('Choose your own password before you continue.'));
    }

    req.user = {
        sub: payload.sub,
        role: currentUser.role,
        departmentId: currentUser.departmentId ?? undefined,
        storeId: currentUser.storeId ?? undefined,
    };
    // The token is valid! Move cleanly to the next middleware or route handler function
    next();
});

// 5. ROLE-BASED AUTHORIZATION MIDDLEWARE (RBAC)
// A higher-order function (curried function) that accepts allowed roles and returns an Express middleware
export const requireRole = (...roles: Role[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        // Guard Clause: If 'authenticate' was not called before this, req.user will be empty. Reject it.
        if (!req.user) return next(AppError.unauthorized());
        
        // Check if the current user's role exists inside the array of allowed roles passed to the factory
        if (!roles.includes(req.user.role)) return next(AppError.forbidden());
        
        // The user possesses an allowed role! Proceed directly to the controller logic
        next();
    };
};
