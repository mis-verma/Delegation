import { z } from "zod"
import { and, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"

export const INVALID_PHONE_MESSAGE = "Enter a valid phone number"
export const PHONE_TAKEN_MESSAGE = "That phone number is already used by another account"

// One place that decides what a stored phone looks like: digits only, 10 to 15 of them. Spaces,
// dashes, dots, brackets and a leading "+" are stripped. Empty input means "no phone" (null).
// Throws on anything else, so callers can turn it into a validation error.
export const normalizePhone = (raw: string | null | undefined): string | null => {
    if (raw === null || raw === undefined) return null
    const cleaned = raw.replace(/[\s\-().[\]{}]/g, "").replace(/^\+/, "")
    if (cleaned === "") return null
    if (!/^\d{10,15}$/.test(cleaned)) throw new Error(INVALID_PHONE_MESSAGE)
    return cleaned
}

// Zod flavour of normalizePhone: "" becomes null, a bad number becomes a field error.
export const phoneSchema = z.string().transform((raw, ctx): string | null => {
    try {
        return normalizePhone(raw)
    } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: INVALID_PHONE_MESSAGE })
        return z.NEVER
    }
})

// Stored phones from before normalisation may still carry spaces, dashes, brackets or a "+", so
// they are cleaned at comparison time rather than rewritten in bulk.
const storedDigits = sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${users.phone}, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '')`

// Same number, with or without a country-code prefix: compare the last 10 digits.
const sameNumber = (digits: string): SQL =>
    sql`(CHAR_LENGTH(${storedDigits}) >= 10 AND RIGHT(${storedDigits}, 10) = ${digits.slice(-10)})`

// Lenient digits for an inbound sender id (WhatsApp / DoubleTick "from"): anything non-digit is
// dropped, and fewer than 10 digits can't be a real number.
const inboundDigits = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, "")
    return digits.length >= 10 ? digits : null
}

// The active user who owns this sender number, or undefined. Used by the WhatsApp and DoubleTick
// webhooks, which previously compared the raw string with the stored phone.
export const findActiveUserByPhone = async (rawFrom: string) => {
    const digits = inboundDigits(rawFrom)
    if (!digits) return undefined
    const rows = await db.select().from(users)
        .where(and(isNotNull(users.phone), eq(users.isActive, true), sameNumber(digits)))
        .limit(5)
    // Prefer an exact digit match if two accounts share the same last 10 digits.
    return rows.find((r) => (r.phone ?? "").replace(/\D/g, "") === digits) ?? rows[0]
}

// Friendly 409 before the DB's unique index gets a chance to throw a raw duplicate error.
export const assertPhoneAvailable = async (digits: string | null | undefined, exceptUserId?: string) => {
    if (!digits) return
    const conditions: SQL[] = [isNotNull(users.phone), sameNumber(digits)]
    if (exceptUserId) conditions.push(ne(users.id, exceptUserId))
    const [taken] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1)
    if (taken) throw AppError.conflict(PHONE_TAKEN_MESSAGE)
}
