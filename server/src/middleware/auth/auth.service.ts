// Node's built-in crypto module - used here for generating random tokens and hashing them.
import crypto from 'node:crypto';
// jsonwebtoken: library for creating and verifying signed JWTs (JSON Web Tokens).
import jwt from 'jsonwebtoken';
// Centralized environment config (secrets, etc).
import { env } from '../../config/env.js';
// Token lifetimes live in the admin-configurable Settings row now, not env vars — see its own
// schema comment (db/schema/core.ts) for why.
import { settingsService } from '../../modules/settings/settings.service.js';
// Drizzle client + table/type definitions — replaces the old Mongoose User/RefreshToken/
// PasswordResetToken models.
import { db } from '../../config/db.js';
import { users, refreshTokens, passwordResetTokens, type Role } from '../../db/schema/core.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
// Custom error class used to throw clean, typed HTTP errors (e.g. 401 Unauthorized).
import { AppError } from '../../utils/AppError.js';
// Password hashing/comparison + rank-defaulting helpers — replace the Mongoose virtual
// setter + pre('validate') hooks that used to live on the User model.
import { hashPassword, comparePassword, deriveDefaultRank } from '../../utils/password.js';
// TypeScript type describing the shape of a validated login request body.
import type { LoginInput, RegisterInput, ResetPasswordInput } from './auth.validation.js';
import { passwordChangeStamp } from './auth.js';
import { auditService } from '../../modules/audit/audit.service.js';
import { mapDuplicateUserError } from '../../modules/users/dbErrors.js';
import { disconnectUserSockets } from '../../sockets/socket.js';
import { invalidateAuthUsers } from './authCache.js';

// Ends every live session of one user (reuse detection below, and any other "log them out
// everywhere" case): all their still-valid refresh tokens are revoked in one statement.
const revokeAllSessions = (userId: string) =>
  db.update(refreshTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

// A precomputed bcrypt hash of a value nobody will ever actually submit as a password — login()
// compares against this when no user was found, so a bcrypt.compare() (~100ms) always runs either
// way. Without it, "no such user" returned instantly (comparePassword only ran when a user
// existed) while "wrong password" took the full bcrypt round-trip — a timing side-channel letting
// an attacker distinguish registered emails from unregistered ones purely from response latency,
// even though the response body is identical (the same class of leak forgotPassword's own comment
// below already guards against, via its unawaited sendMail).
const DUMMY_PASSWORD_HASH = '$2a$12$AP9v7BykEtGtvg7jStw7XusQRbTIjqkuvFNOcvITorrW1v566Io3.';

// The shape of a user row as used by this service (a plain object now, not a Mongoose
// document — no more `._id`/`.comparePassword()` methods attached to it).
type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  firstName: string;
  departmentId: string | null;
  storeId: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
};

// Creates a brand new refresh token for a given user, stores its HASH (not the raw value) in the
// DB, and returns the raw token so it can be sent to the client as a cookie.
// Why hash it? If someone ever reads the database (breach, leaked backup, etc.), they'd only see
// hashes, not usable tokens - the same reason passwords are hashed instead of stored in plain text.
const issueRefreshToken = async (userId: string): Promise<string> => {
  // Generate 32 random bytes and represent them as a hex string - this is the actual secret
  // that will be sent to the browser and stored in the cookie.
  const rawToken = crypto.randomBytes(32).toString('hex');
  // Hash the raw token with SHA-256 before saving it - this is what actually goes into the database.
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Save a record in the RefreshToken table linking this hashed token to the user,
  // along with an expiry date so old tokens naturally become invalid.
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    // Refresh tokens are long-lived compared to short-lived access tokens. Must stay in sync
    // with the cookie's maxAge (auth.controller.ts) — both read the same Settings field so raising
    // or lowering refreshTokenExpiresDays actually changes the real session lifetime instead of
    // only changing how long the browser keeps a cookie for a token that's already expired in the DB.
    expiresAt: new Date(Date.now() + settingsService.getCached().refreshTokenExpiresDays * 24 * 60 * 60 * 1000),
  });

  // Return the RAW (unhashed) token - this is the only moment it exists outside the DB;
  // we never store or log the raw value again after this.
  return rawToken;
};

// Small helper to hash any raw token the same way it was hashed when it was issued, so we can
// look it up in the database by comparing hashes instead of raw values.
const hashToken = (raw: string): string => {
  return crypto.createHash('sha256').update(raw).digest('hex');
};

// Creates a short-lived JWT "access token" that identifies the user on each API request.
// Unlike the refresh token, this is NOT stored in the database - its validity is verified purely
// by checking its cryptographic signature (see auth.ts's `authenticate` middleware).
const signAccessToken = (user: UserRow) =>
  jwt.sign({
    // "sub" (subject) is the standard JWT field for "who is this token about" - the user's id.
    sub: user.id,
    // Include the user's role so downstream middleware (requireRole) can do access control
    // without needing another database lookup.
    role: user.role,
    // Optional extra context embedded in the token, useful for scoping requests to a department...
    departmentId: user.departmentId ?? undefined,
    // ...or a specific store, if the user belongs to one.
    storeId: user.storeId ?? undefined,

  }, env.JWT_ACCESS_SECRET, {
    // How long this access token stays valid before the client must use the refresh token to get a
    // new one. jsonwebtoken accepts a plain number here as seconds — no need to build a duration
    // string like "15m" out of the admin-configured minutes value.
    expiresIn: settingsService.getCached().accessTokenExpiresMinutes * 60
  });

// Strips out any sensitive/internal fields (like the password hash) before sending user data back
// to the client - we only expose what the frontend actually needs.
const publicUser = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  firstName: user.firstName,
  departmentId: user.departmentId ?? null,
  storeId: user.storeId ?? null,
  // The password was set by an admin: the app asks for a new one before anything else.
  mustChangePassword: user.mustChangePassword ?? false,
});

// The main authentication service - all the actual "business logic" for login/refresh/logout lives
// here, separate from the HTTP-handling code in auth.controller.ts.
export const authService = {
  // Handles a brand new signup. Every self-registered account starts as a plain "USER" (never
  // ADMIN/MANAGER/AGENT) with no department/store — those are only ever set by an admin later
  // via the /users management endpoints, not chosen by the person signing themselves up.
  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw AppError.conflict('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const role: Role = 'USER';
    // User.id is a client-generated cuid (see src/db/schema/core.ts), not a DB auto-increment
    // column, so mysql2's `insertId` (which only makes sense for AUTO_INCREMENT PKs) can't be
    // used to recover it — generate it up front instead, so we already have it after the insert.
    const newId = createId();
    try {
      await db.insert(users).values({
        id: newId,
        email,
        firstName: input.firstName,
        lastName: input.lastName || null,
        passwordHash,
        role,
        rank: deriveDefaultRank(role),
      });
    } catch (err) {
      // Two sign-ups racing for the same address: the unique index wins, the loser gets a clean 409.
      throw mapDuplicateUserError(err);
    }
    // We already know every field we need — no round-trip re-select required.
    const user: UserRow = {
      id: newId, email, passwordHash, role,
      firstName: input.firstName, departmentId: null, storeId: null, isActive: true,
    };

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: publicUser(user) };
  },

  // Handles a login attempt: check credentials, and if valid, issue a fresh pair of tokens.
  async login(input: LoginInput) {
    // The schema lowercased/trimmed email on SAVE in the old Mongoose model, never on a query
    // filter - so this lookup has to normalize the same way, or a merely differently-cased/padded
    // email (which is how the account is actually stored) silently fails to match.
    const email = input.email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Compare against the real hash when a user exists, or a fixed dummy hash when they don't —
    // always paying the same bcrypt cost either way (see DUMMY_PASSWORD_HASH above) so the two
    // cases can't be told apart by response timing, only by the identical rejection below.
    const valid = await comparePassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    // If no user was found, OR the account has been deactivated, OR the password didn't match,
    // reject with the same generic message — stops attackers from being able to tell whether a
    // given email is registered (user enumeration).
    if (!user || !user.isActive || !valid) throw AppError.unauthorized('Invalid credentials');

    // Credentials check out - issue a new short-lived access token...
    const accessToken = signAccessToken(user);
    // ...and a new long-lived refresh token (stored hashed in the DB).
    const refreshToken = await issueRefreshToken(user.id);
    // Return everything the controller needs to build its response.
    return { accessToken, refreshToken, user: publicUser(user) };
  },

  // Handles refreshing an access token using a previously issued refresh token (read from a cookie).
  async refresh(rawToken: string | undefined) {
    // No token at all means the client isn't logged in (or the cookie expired/was cleared).
    if (!rawToken) throw AppError.unauthorized('Missing refresh token');

    // Hash the incoming raw token the same way we did when it was created, so we can find it in
    // the DB (we never store raw tokens, so we can't look them up directly).
    const tokenHash = hashToken(rawToken);
    const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    // Reject if the token doesn't exist.
    if (!stored) throw AppError.unauthorized('Invalid refresh token');

    // REUSE DETECTION: a token that was already rotated (or logged out) is being presented again.
    // Whoever holds it either stole it or is the real owner racing a thief, and we can't tell which,
    // so every session of this user ends and they have to sign in again.
    if (stored.revokedAt) {
      await revokeAllSessions(stored.userId);
      throw AppError.unauthorized('Invalid refresh token');
    }
    // Plain expiry.
    if (stored.expiresAt < new Date()) throw AppError.unauthorized('Invalid refresh token');

    // Look up the user this token belongs to, and make sure their account is still active.
    const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
    if (!user || !user.isActive) throw AppError.unauthorized('Invalid refresh token');

    // Revoke (invalidate) the OLD refresh token now that it's being used - this is "refresh token
    // rotation": each refresh token can only be used once, which limits the damage if a token were
    // ever stolen (the thief and the real user can't both keep using the same one indefinitely).
    // The revoke is a compare-and-set (`revokedAt IS NULL`) and must affect exactly one row: of two
    // simultaneous requests carrying the same token only one wins, the other is treated as reuse.
    const now = new Date();
    const [revoked] = await db.update(refreshTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)));
    if (revoked.affectedRows !== 1) {
      await revokeAllSessions(stored.userId);
      throw AppError.unauthorized('Invalid refresh token');
    }

    // Issue a brand new access token...
    const accessToken = signAccessToken(user);
    // ...and a brand new refresh token to replace the one we just revoked.
    const newRefreshToken = await issueRefreshToken(user.id);
    return { accessToken, refreshToken: newRefreshToken, user: publicUser(user) };
  },

  // Handles logging a user out by revoking their refresh token so it can never be used again.
  async logout(rawToken: string | undefined) {
    // If there's no token to begin with, there's nothing to revoke - just quietly succeed.
    if (!rawToken) return;
    // Find the matching token by its hash and mark it revoked (soft-delete style, keeps a record around).
    await db.update(refreshTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hashToken(rawToken)));
  },

  // Handles the actual password reset once the user clicks the emailed link and submits a new password.
  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = hashToken(input.token);
    const [stored] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw AppError.badRequest('Invalid or expired reset link');
    }

    const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
    if (!user || !user.isActive) throw AppError.badRequest('Invalid or expired reset link');

    const passwordHash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      const now = new Date();
      // One-time use, claimed first and atomically: of two requests carrying the same link only
      // one gets to change the password.
      const [claimed] = await tx.update(passwordResetTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(and(eq(passwordResetTokens.id, stored.id), isNull(passwordResetTokens.usedAt)));
      if (claimed.affectedRows !== 1) throw AppError.badRequest('Invalid or expired reset link');

      await tx.update(users).set({ passwordHash, passwordChangedAt: passwordChangeStamp(), mustChangePassword: false, updatedAt: now }).where(eq(users.id, user.id));

      // Any other reset link still outstanding for this account dies with the old password.
      await tx.update(passwordResetTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

      // Revoke every active session too - if someone else had a stolen refresh token, this
      // password reset is exactly the moment to kick them out.
      await tx.update(refreshTokens)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));

      await auditService.recordInTx(tx, { entityType: 'User', entityId: user.id, action: 'PASSWORD_RESET', actorId: user.id, before: { email: user.email, via: 'emailed link' } });
    });
    await invalidateAuthUsers(user.id);
    disconnectUserSockets(user.id);
  },
};
