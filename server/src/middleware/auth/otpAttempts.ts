import { and, eq, gt, lt, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { passwordOtps } from "../../db/schema/core.js"

type OtpPurpose = (typeof passwordOtps.purpose.enumValues)[number]

export const MAX_OTP_ATTEMPTS = 5
export const MAX_WRONG_CODES_PER_HOUR = 10
export const MAX_CODES_PER_HOUR = 6
const HOUR_MS = 60 * 60 * 1000

export const reserveAttempt = async (otpId: string): Promise<boolean> => {
    const [result] = await db.update(passwordOtps)
        .set({ attempts: sql`${passwordOtps.attempts} + 1` })
        .where(and(eq(passwordOtps.id, otpId), lt(passwordOtps.attempts, MAX_OTP_ATTEMPTS)))
    return result.affectedRows === 1
}

export const attemptsInLastHour = async (userId: string, purpose: OtpPurpose): Promise<number> => {
    const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${passwordOtps.attempts}), 0)` })
        .from(passwordOtps)
        .where(and(eq(passwordOtps.userId, userId), eq(passwordOtps.purpose, purpose), gt(passwordOtps.createdAt, new Date(Date.now() - HOUR_MS))))
    return Number(row?.total ?? 0)
}

export const codesInLastHour = async (userId: string, purpose: OtpPurpose): Promise<number> => {
    const [row] = await db.select({ total: sql<string>`COUNT(*)` })
        .from(passwordOtps)
        .where(and(eq(passwordOtps.userId, userId), eq(passwordOtps.purpose, purpose), gt(passwordOtps.createdAt, new Date(Date.now() - HOUR_MS))))
    return Number(row?.total ?? 0)
}
