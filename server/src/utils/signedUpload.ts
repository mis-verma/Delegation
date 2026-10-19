import crypto from "node:crypto"
import { env } from "../config/env.js"

const SIGNING_KEY = `${env.JWT_ACCESS_SECRET}:uploads`

const TTL_SECONDS = 24 * 60 * 60

const sign = (relPath: string, exp: number) =>
    crypto.createHmac("sha256", SIGNING_KEY).update(`${relPath}:${exp}`).digest("hex")

export const signUploadPath = (relPath: string): string => {
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
    const sig = sign(relPath, exp)
    const sep = relPath.includes("?") ? "&" : "?"
    return `${relPath}${sep}exp=${exp}&sig=${sig}`
}

export const verifyUploadSignature = (relPath: string, expParam: unknown, sigParam: unknown): boolean => {
    if (typeof expParam !== "string" || typeof sigParam !== "string") return false
    const exp = Number(expParam)
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false

    const expected = sign(relPath, exp)
    const a = Buffer.from(expected, "hex")
    const b = Buffer.from(sigParam, "hex")
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export const signUploadPathsDeep = <T>(value: T): T => {
    if (typeof value === "string") {
        return (value.startsWith("/uploads/") && !value.includes("sig=") ? signUploadPath(value) : value) as T
    }
    if (Array.isArray(value)) {
        return value.map(signUploadPathsDeep) as T
    }
    if (value instanceof Date) {
        return value
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = signUploadPathsDeep(v)
        return out as T
    }
    return value
}
