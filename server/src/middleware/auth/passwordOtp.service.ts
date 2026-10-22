import crypto from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { sendMail } from '../../config/mailer.js';
import { passwordOtps, refreshTokens, users, PASSWORD_OTP_PURPOSES } from '../../db/schema/core.js';
import { settingsService } from '../../modules/settings/settings.service.js';
import { auditService } from '../../modules/audit/audit.service.js';
import { disconnectUserSockets } from '../../sockets/socket.js';
import { AppError } from '../../utils/AppError.js';
import { hashPassword } from '../../utils/password.js';
import { passwordChangeStamp } from './auth.js';
import { invalidateAuthUsers } from './authCache.js';

type Purpose = (typeof PASSWORD_OTP_PURPOSES)[number];

const MAX_ATTEMPTS = 5;
const LIFETIME_MINUTES: Record<Purpose, number> = { RESET: 10, SETUP: 24 * 60, LOGIN: 10 };
const WRONG_CODE = 'That code is wrong or has expired. Ask for a new one.';

export const hashCode = (userId: string, code: string) =>
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${userId}:${code}`).digest('hex');

export const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const lifetimeText = (purpose: Purpose) => (purpose === 'SETUP' ? '24 hours' : '10 minutes');

const emailBody = (purpose: Purpose, firstName: string, code: string, orgName: string, email: string) => {
  const link = `${env.CLIENT_URL}/reset-password?email=${encodeURIComponent(email)}`;
  const intro = purpose === 'SETUP'
    ? `Welcome to ${escapeHtml(orgName)}. Use this code to set your own password.`
    : `Use this code to set a new password for your ${escapeHtml(orgName)} account.`;
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.5">
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>${intro}</p>
    <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0;color:#1e3a8a">${code}</p>
    <p>It works for ${lifetimeText(purpose)}. Enter it on the <a href="${link}">set password page</a> with your email, ${escapeHtml(email)}.</p>
    <p style="color:#6b7280;font-size:13px">If you did not ask for this, you can ignore this email. Your password stays the same.</p>
  </div>`;
};

const issue = async (user: { id: string; email: string; firstName: string }, purpose: Purpose) => {
  const now = new Date();
  await db.update(passwordOtps)
    .set({ usedAt: now })
    .where(and(eq(passwordOtps.userId, user.id), inArray(passwordOtps.purpose, ['RESET', 'SETUP']), isNull(passwordOtps.usedAt)));

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await db.insert(passwordOtps).values({
    userId: user.id,
    purpose,
    codeHash: hashCode(user.id, code),
    expiresAt: new Date(now.getTime() + LIFETIME_MINUTES[purpose] * 60 * 1000),
    createdAt: now,
  });

  console.log(`[auth] Password ${purpose === 'SETUP' ? 'setup' : 'reset'} code issued for ${user.email}`);
  if (env.NODE_ENV !== 'production') console.log(`[auth] Code for ${user.email}: ${code}`);

  const orgName = settingsService.getCached().orgName;
  return sendMail({
    to: user.email,
    subject: purpose === 'SETUP' ? `Your ${orgName} setup code: ${code}` : `Your ${orgName} password code: ${code}`,
    html: emailBody(purpose, user.firstName, code, orgName, user.email),
  });
};

export const passwordOtpService = {
  async requestReset(rawEmail: string) {
    const [user] = await db.select({ id: users.id, email: users.email, firstName: users.firstName })
      .from(users)
      .where(and(eq(users.email, rawEmail.trim().toLowerCase()), eq(users.isActive, true)))
      .limit(1);
    if (!user) return;
    void issue(user, 'RESET').catch((err) => console.error('[auth] Failed to send password code:', err));
  },

  async sendSetupCode(userId: string, actorId: string) {
    const [user] = await db.select({ id: users.id, email: users.email, firstName: users.firstName, isActive: users.isActive })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppError.notFound('User not found');
    if (!user.isActive) throw AppError.badRequest('This account is deactivated. Reactivate it first.');
    await issue(user, 'SETUP');
    await auditService.record({ entityType: 'User', entityId: user.id, action: 'PASSWORD_CODE_SENT', actorId, after: { email: user.email } });
  },

  async resetWithCode(input: { email: string; code: string; password: string }) {
    const [user] = await db.select({ id: users.id, email: users.email, isActive: users.isActive })
      .from(users).where(eq(users.email, input.email.trim().toLowerCase())).limit(1);
    if (!user || !user.isActive) throw AppError.badRequest(WRONG_CODE);

    const now = new Date();
    const [otp] = await db.select().from(passwordOtps)
      .where(and(eq(passwordOtps.userId, user.id), inArray(passwordOtps.purpose, ['RESET', 'SETUP']), isNull(passwordOtps.usedAt), gt(passwordOtps.expiresAt, now)))
      .orderBy(desc(passwordOtps.createdAt))
      .limit(1);
    if (!otp) throw AppError.badRequest(WRONG_CODE);

    if (!sameHash(otp.codeHash, hashCode(user.id, input.code))) {
      const attempts = otp.attempts + 1;
      await db.update(passwordOtps)
        .set({ attempts, ...(attempts >= MAX_ATTEMPTS ? { usedAt: now } : {}) })
        .where(eq(passwordOtps.id, otp.id));
      const left = MAX_ATTEMPTS - attempts;
      throw AppError.badRequest(left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.');
    }

    const passwordHash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(passwordOtps)
        .set({ usedAt: now })
        .where(and(eq(passwordOtps.id, otp.id), isNull(passwordOtps.usedAt)));
      if (claimed.affectedRows !== 1) throw AppError.badRequest(WRONG_CODE);

      await tx.update(users)
        .set({ passwordHash, passwordChangedAt: passwordChangeStamp(), mustChangePassword: false, updatedAt: now })
        .where(eq(users.id, user.id));
      await tx.update(passwordOtps).set({ usedAt: now }).where(and(eq(passwordOtps.userId, user.id), isNull(passwordOtps.usedAt)));
      await tx.update(refreshTokens)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
      await auditService.recordInTx(tx, {
        entityType: 'User', entityId: user.id, action: 'PASSWORD_RESET', actorId: user.id,
        before: { email: user.email, via: otp.purpose === 'SETUP' ? 'email setup code' : 'email reset code' },
      });
    });
    await invalidateAuthUsers(user.id);
    disconnectUserSockets(user.id);
  },
};
