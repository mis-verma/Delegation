import crypto from "node:crypto"
import { env } from "../config/env.js"

// Every uploaded file (checklist/ticket/task photos, avatars, org logo, ...) is served by
// app.ts's `/uploads` static route from a random, unguessable filename - fine against someone
// browsing/enumerating files, but not actually private: anyone who ever got hold of one of
// these links (a forwarded screenshot, browser history, a shared chat message) could open it
// forever, no login required. This signs every `/uploads/...` path embedded in an API response
// with a short-lived HMAC token instead, and app.ts's static route now refuses to serve a
// request whose signature is missing, wrong, or expired - so a link only works for as long as
// TTL_SECONDS below, and only ever reaches someone who was actually logged in when the API
// handed it to them.
//
// Reuses JWT_ACCESS_SECRET (with a fixed suffix, so it's a cryptographically distinct key from
// the one used to sign login tokens) instead of requiring a brand-new env var - the production
// .env lives on the VPS, hand-maintained, never touched by CI (see deploy/ecosystem.config.cjs),
// so a new *required* var there risks an outage on the next deploy rather than a config change
// someone remembers to make first.
const SIGNING_KEY = `${env.JWT_ACCESS_SECRET}:uploads`

// Generous on purpose: this is an internal ops tool where a ticket/checklist detail panel can
// plausibly stay open on someone's screen for a full shift, and every fresh page load or React
// Query refetch re-signs the link anyway (see signUploadPathsDeep below, wired into every
// res.json() in app.ts) - this only bounds how long a link keeps working *after* it stops being
// re-issued, not how long a single viewing session can last.
const TTL_SECONDS = 24 * 60 * 60 // 24h

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

// Deep-walks any JSON-serializable API response value and appends a signature to every string
// that looks like one of our own upload paths - covers every field that ever holds one
// (avatarUrl, logoUrl, checklist item photos, ticket/task attachments, comment images, ...)
// across every module without each of them needing to remember to sign it themselves. Wired
// into res.json globally in app.ts rather than called per-route.
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
