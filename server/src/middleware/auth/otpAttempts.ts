import { eq, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { passwordOtps } from "../../db/schema/core.js"

export const MAX_OTP_ATTEMPTS = 5

export const recordWrongCode = async (otpId: string) => {
    await db.update(passwordOtps)
        .set({
            attempts: sql`${passwordOtps.attempts} + 1`,
            usedAt: sql`IF(${passwordOtps.attempts} >= ${MAX_OTP_ATTEMPTS}, ${new Date()}, ${passwordOtps.usedAt})`,
        })
        .where(eq(passwordOtps.id, otpId))
}
