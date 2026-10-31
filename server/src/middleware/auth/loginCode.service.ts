import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { sendMail } from '../../config/mailer.js'
import { passwordOtps } from '../../db/schema/core.js'
import { settingsService } from '../../modules/settings/settings.service.js'
import { AppError } from '../../utils/AppError.js'
import { escapeHtml } from '../../utils/escapeHtml.js'
import { hashCode, sameHash } from './passwordOtp.service.js'
import { MAX_CODES_PER_HOUR, WRONG_CODE, codesInLastHour, reserveActiveOtp } from './otpAttempts.js'

const LOCKED = 'Too many tries. Wait an hour, or ask another admin to turn the sign-in code off.'
const CODE_MINUTES = 10
const CHALLENGE_MINUTES = 15
const DEVICE_DAYS = 30
const RESEND_AFTER_MS = 30_000

const derivedSecret = (purpose: string) => crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(purpose).digest('hex')
const CHALLENGE_SECRET = () => derivedSecret('login-challenge')
const DEVICE_SECRET = () => derivedSecret('admin-device')

export const adminCodeRequired = () => settingsService.getCached().requireAdminLoginCode && !!env.SMTP_HOST

export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`
}

export const signChallenge = (userId: string) =>
  jwt.sign({ sub: userId, typ: 'login-challenge' }, CHALLENGE_SECRET(), { expiresIn: CHALLENGE_MINUTES * 60 })

export const readChallenge = (token: string): string => {
  try {
    const payload = jwt.verify(token, CHALLENGE_SECRET(), { algorithms: ['HS256'] }) as { sub?: string; typ?: string }
    if (payload.typ !== 'login-challenge' || !payload.sub) throw new Error('wrong token')
    return payload.sub
  } catch {
    throw AppError.unauthorized('Your sign-in took too long. Please sign in again.')
  }
}

export const signDeviceToken = (userId: string) =>
  jwt.sign({ sub: userId, typ: 'admin-device' }, DEVICE_SECRET(), { expiresIn: DEVICE_DAYS * 24 * 3600 })

export const isTrustedDevice = (token: string | undefined, userId: string): boolean => {
  if (!token) return false
  try {
    const payload = jwt.verify(token, DEVICE_SECRET(), { algorithms: ['HS256'] }) as { sub?: string; typ?: string }
    return payload.typ === 'admin-device' && payload.sub === userId
  } catch {
    return false
  }
}

export const issueLoginCode = async (user: { id: string; email: string; firstName: string }, options: { enforceCooldown?: boolean } = {}) => {
  const now = new Date()
  if (await codesInLastHour(user.id, 'LOGIN') >= MAX_CODES_PER_HOUR) throw AppError.tooManyRequests(LOCKED)
  if (options.enforceCooldown) {
    const [last] = await db.select({ createdAt: passwordOtps.createdAt }).from(passwordOtps)
      .where(and(eq(passwordOtps.userId, user.id), eq(passwordOtps.purpose, 'LOGIN')))
      .orderBy(desc(passwordOtps.createdAt)).limit(1)
    if (last && now.getTime() - last.createdAt.getTime() < RESEND_AFTER_MS) {
      throw AppError.badRequest('Wait a few seconds before asking for another code.')
    }
  }

  await db.update(passwordOtps)
    .set({ usedAt: now })
    .where(and(eq(passwordOtps.userId, user.id), eq(passwordOtps.purpose, 'LOGIN'), isNull(passwordOtps.usedAt)))

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  await db.insert(passwordOtps).values({
    userId: user.id,
    purpose: 'LOGIN',
    codeHash: hashCode(user.id, code),
    expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000),
    createdAt: now,
  })

  console.log(`[auth] Sign-in code issued for ${user.email}`)
  if (env.NODE_ENV !== 'production') console.log(`[auth] Sign-in code for ${user.email}: ${code}`)

  const orgName = settingsService.getCached().orgName
  try {
    await sendMail({
      to: user.email,
      subject: `Your ${orgName} sign-in code: ${code}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.5">
    <p>Hi ${escapeHtml(user.firstName)},</p>
    <p>Use this code to finish signing in to ${escapeHtml(orgName)}.</p>
    <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0;color:#1e3a8a">${code}</p>
    <p>It works for ${CODE_MINUTES} minutes.</p>
    <p style="color:#6b7280;font-size:13px">If this was not you, someone knows your password. Change it now and tell your team.</p>
  </div>`,
    })
  } catch (err) {
    console.error('[auth] Could not email the sign-in code:', err)
    throw AppError.badRequest("We couldn't email your sign-in code. Try again in a minute, or ask another admin to turn the sign-in code off.")
  }
}

export const verifyLoginCode = async (userId: string, code: string) => {
  const otp = await reserveActiveOtp(userId, ['LOGIN'], LOCKED)
  if (!sameHash(otp.codeHash, hashCode(userId, code))) throw AppError.badRequest(WRONG_CODE)

  const [claimed] = await db.update(passwordOtps)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordOtps.id, otp.id), isNull(passwordOtps.usedAt)))
  if (claimed.affectedRows !== 1) throw AppError.badRequest(WRONG_CODE)
}
