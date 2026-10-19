import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { settingsService } from '../../modules/settings/settings.service.js';
import { db } from '../../config/db.js';
import { users, refreshTokens, passwordResetTokens, type Role } from '../../db/schema/core.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { AppError } from '../../utils/AppError.js';
import { hashPassword, comparePassword, deriveDefaultRank } from '../../utils/password.js';
import type { LoginInput, RegisterInput, ResetPasswordInput } from './auth.validation.js';
import { passwordChangeStamp } from './auth.js';
import { auditService } from '../../modules/audit/audit.service.js';
import { mapDuplicateUserError } from '../../modules/users/dbErrors.js';
import { disconnectUserSockets } from '../../sockets/socket.js';
import { invalidateAuthUsers } from './authCache.js';

const revokeAllSessions = (userId: string) =>
  db.update(refreshTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

const DUMMY_PASSWORD_HASH = '$2a$12$AP9v7BykEtGtvg7jStw7XusQRbTIjqkuvFNOcvITorrW1v566Io3.';

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

const issueRefreshToken = async (userId: string): Promise<string> => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + settingsService.getCached().refreshTokenExpiresDays * 24 * 60 * 60 * 1000),
  });

  return rawToken;
};

const hashToken = (raw: string): string => {
  return crypto.createHash('sha256').update(raw).digest('hex');
};

const signAccessToken = (user: UserRow) =>
  jwt.sign({
    sub: user.id,
    role: user.role,
    departmentId: user.departmentId ?? undefined,
    storeId: user.storeId ?? undefined,

  }, env.JWT_ACCESS_SECRET, {
    expiresIn: settingsService.getCached().accessTokenExpiresMinutes * 60
  });

const publicUser = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  firstName: user.firstName,
  departmentId: user.departmentId ?? null,
  storeId: user.storeId ?? null,
  mustChangePassword: user.mustChangePassword ?? false,
});

export const authService = {
  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw AppError.conflict('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const role: Role = 'USER';
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
      throw mapDuplicateUserError(err);
    }
    const user: UserRow = {
      id: newId, email, passwordHash, role,
      firstName: input.firstName, departmentId: null, storeId: null, isActive: true,
    };

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: publicUser(user) };
  },

  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    const valid = await comparePassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !user.isActive || !valid) throw AppError.unauthorized('Invalid credentials');

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: publicUser(user) };
  },

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw AppError.unauthorized('Missing refresh token');

    const tokenHash = hashToken(rawToken);
    const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    if (!stored) throw AppError.unauthorized('Invalid refresh token');

    if (stored.revokedAt) {
      await revokeAllSessions(stored.userId);
      throw AppError.unauthorized('Invalid refresh token');
    }
    if (stored.expiresAt < new Date()) throw AppError.unauthorized('Invalid refresh token');

    const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
    if (!user || !user.isActive) throw AppError.unauthorized('Invalid refresh token');

    const now = new Date();
    const [revoked] = await db.update(refreshTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)));
    if (revoked.affectedRows !== 1) {
      await revokeAllSessions(stored.userId);
      throw AppError.unauthorized('Invalid refresh token');
    }

    const accessToken = signAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user.id);
    return { accessToken, refreshToken: newRefreshToken, user: publicUser(user) };
  },

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await db.update(refreshTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hashToken(rawToken)));
  },

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
      const [claimed] = await tx.update(passwordResetTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(and(eq(passwordResetTokens.id, stored.id), isNull(passwordResetTokens.usedAt)));
      if (claimed.affectedRows !== 1) throw AppError.badRequest('Invalid or expired reset link');

      await tx.update(users).set({ passwordHash, passwordChangedAt: passwordChangeStamp(), mustChangePassword: false, updatedAt: now }).where(eq(users.id, user.id));

      await tx.update(passwordResetTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

      await tx.update(refreshTokens)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));

      await auditService.recordInTx(tx, { entityType: 'User', entityId: user.id, action: 'PASSWORD_RESET', actorId: user.id, before: { email: user.email, via: 'emailed link' } });
    });
    await invalidateAuthUsers(user.id);
    disconnectUserSockets(user.id);
  },
};
