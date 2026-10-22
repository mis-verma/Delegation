import type { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import { env } from "../../config/index.js";
import { AppError, asyncHandler } from "../../utils/index.js";
import type { Role } from "../../db/schema/core.js";
import { db } from "../../config/db.js";
import { users } from "../../db/schema/core.js";
import { eq } from "drizzle-orm";
import { cached } from "../../config/queryCache.js";
import { AUTH_USER_TTL_SECONDS, authUserKey } from "./authCache.js";

export type AccessTokenPayload = { sub: string; role: Role; departmentId?: string; storeId?: string; iat?: number };

export const passwordChangeStamp = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export const tokenPredatesPasswordChange = (iat: number | undefined, passwordChangedAt: Date | null | undefined) =>
    !!passwordChangedAt && (typeof iat !== 'number' || iat < Math.floor(passwordChangedAt.getTime() / 1000));

declare global {
    namespace Express {
        interface Request {
            user?: AccessTokenPayload;
            viewingAs?: { adminId: string };
        }
    }
}

const isPasswordSetupCall = (req: Request) => {
    const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');
    return (req.method === 'GET' && path.endsWith('/users/me')) || (req.method === 'POST' && path.endsWith('/users/me/password'));
};

const loadAuthUser = (id: string) => cached(authUserKey(id), AUTH_USER_TTL_SECONDS, async () => {
    const [row] = await db.select({
        role: users.role,
        isActive: users.isActive,
        departmentId: users.departmentId,
        storeId: users.storeId,
        passwordChangedAt: users.passwordChangedAt,
        mustChangePassword: users.mustChangePassword,
    }).from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
});

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized('Missing access token'));

    const token = header.slice('Bearer '.length);

    let payload: AccessTokenPayload;
    try {
        payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
    } catch {
        return next(AppError.unauthorized('Invalid or expired access token'));
    }

    const cachedUser = await loadAuthUser(payload.sub);
    const currentUser = cachedUser && {
        ...cachedUser,
        passwordChangedAt: cachedUser.passwordChangedAt ? new Date(cachedUser.passwordChangedAt) : null,
    };

    if (!currentUser || !currentUser.isActive) {
        return next(AppError.unauthorized('Account is no longer active'));
    }
    if (tokenPredatesPasswordChange(payload.iat, currentUser.passwordChangedAt)) {
        return next(AppError.unauthorized('Password was changed. Please sign in again.'));
    }

    if (currentUser.mustChangePassword && !isPasswordSetupCall(req)) {
        return next(AppError.forbidden('Choose your own password before you continue.'));
    }

    const viewAsId = req.headers["x-view-as"];
    if (typeof viewAsId === "string" && viewAsId && viewAsId !== payload.sub && currentUser.role === "ADMIN") {
        if (!READ_ONLY_METHODS.has(req.method)) {
            return next(AppError.forbidden("You are previewing someone else’s account, so nothing can be changed. Exit the preview first."));
        }
        const target = await loadAuthUser(viewAsId);
        if (!target || !target.isActive || target.role === "ADMIN") {
            return next(AppError.forbidden("That account can’t be previewed. Exit the preview and pick someone else."));
        }
        req.user = {
            sub: viewAsId,
            role: target.role,
            departmentId: target.departmentId ?? undefined,
            storeId: target.storeId ?? undefined,
        };
        req.viewingAs = { adminId: payload.sub };
        return next();
    }

    req.user = {
        sub: payload.sub,
        role: currentUser.role,
        departmentId: currentUser.departmentId ?? undefined,
        storeId: currentUser.storeId ?? undefined,
    };
    next();
});

export const requireRole = (...roles: Role[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) return next(AppError.unauthorized());
        
        if (!roles.includes(req.user.role)) return next(AppError.forbidden());
        
        next();
    };
};
