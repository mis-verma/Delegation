import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { passwordOtps } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"

type OtpPurpose = (typeof passwordOtps.purpose.enumValues)[number]

export const MAX_OTP_ATTEMPTS = 5
export const MAX_WRONG_CODES_PER_HOUR = 10
export const MAX_CODES_PER_HOUR = 6
export const WRONG_CODE = "That code is wrong or has expired. Ask for a new one."
const HOUR_MS = 60 * 60 * 1000

const reserveAttempt = async (otpId: string): Promise<boolean> => {
    const [result] = await db.update(passwordOtps)
        .set({ attempts: sql`${passwordOtps.attempts} + 1` })
        .where(and(eq(passwordOtps.id, otpId), lt(passwordOtps.attempts, MAX_OTP_ATTEMPTS)))
    return result.affectedRows === 1
}

const attemptsInLastHour = async (userId: string, purposes: OtpPurpose[]): Promise<number> => {
    const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${passwordOtps.attempts}), 0)` })
        .from(passwordOtps)
        .where(and(eq(passwordOtps.userId, userId), inArray(passwordOtps.purpose, purposes), gt(passwordOtps.createdAt, new Date(Date.now() - HOUR_MS))))
    return Number(row?.total ?? 0)
}

export const codesInLastHour = async (userId: string, purpose: OtpPurpose): Promise<number> => {
    const [row] = await db.select({ total: sql<string>`COUNT(*)` })
        .from(passwordOtps)
        .where(and(eq(passwordOtps.userId, userId), eq(passwordOtps.purpose, purpose), gt(passwordOtps.createdAt, new Date(Date.now() - HOUR_MS))))
    return Number(row?.total ?? 0)
}

export const reserveActiveOtp = async (userId: string, purposes: OtpPurpose[], lockedMessage: string) => {
    if (await attemptsInLastHour(userId, purposes) >= MAX_WRONG_CODES_PER_HOUR) throw AppError.tooManyRequests(lockedMessage)

    const [otp] = await db.select().from(passwordOtps)
        .where(and(eq(passwordOtps.userId, userId), inArray(passwordOtps.purpose, purposes), isNull(passwordOtps.usedAt), gt(passwordOtps.expiresAt, new Date())))
        .orderBy(desc(passwordOtps.createdAt))
        .limit(1)
    if (!otp || !(await reserveAttempt(otp.id))) throw AppError.badRequest(WRONG_CODE)
    return otp
}
