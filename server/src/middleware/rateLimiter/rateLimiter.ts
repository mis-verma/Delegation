import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Store } from "express-rate-limit";


// This is the blanket limiter over every route (including /health), not a narrow abuse guard on
// one endpoint — an authenticated SPA session alone (notifications polling, KPI strip, activity
// gauges, verification queue, each on their own refetch interval) comfortably generates more than
// 300 requests/15min just from normal use across a couple of open tabs. Once exhausted, every
// react-query retry just re-triggers the block for the rest of the window, reads as the whole app
// going down. 2000/15min is still a real ceiling against actual abuse, just not one normal
// dashboard usage trips over.
export const createApiLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many requests, please try again later." }
})

export const createAuthLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

// Login gets its own IP budget: only FAILED attempts count (skipSuccessfulRequests), so a store full
// of staff signing in from one shared IP at shift change no longer burns the budget just by logging in.
export const createLoginLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

// Keyed by the (trimmed, lowercased) email in the body, falling back to the caller's IP when there
// is none. A per-email budget stops one account being hammered from many IPs, and stops the
// forgot-password endpoint being used to mail-bomb one inbox (each call mails + inserts a token row).
const emailKey = (req: Request): string => {
    const email = (req.body as { email?: unknown } | undefined)?.email
    if (typeof email === "string" && email.trim()) return `email:${email.trim().toLowerCase().slice(0, 191)}`
    return `ip:${ipKeyGenerator(req.ip ?? "")}`
}

// 10 failed logins per email per 15 minutes (successful logins do not count).
export const createLoginEmailLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: emailKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many failed sign-in attempts for this account, please try again later." }
})

// 5 reset emails per address per hour.
export const createForgotPasswordEmailLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: emailKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many reset requests for this address, please try again later." }
})

// register/reset-password are brute-force-prone and stay on the
// tight 20/15min budget above — but refresh/logout aren't attack surfaces in the same way, and
// every open tab/device calls /auth/refresh roughly every accessTokenExpiresMinutes (15min default,
// admin-configurable — see Settings).
// A handful of staff sharing one store's IP (this app's actual usage pattern — see the store/
// department modules) can burn through 20 shared requests on ordinary shift-change login/refresh
// traffic alone, locking everyone out for the rest of the window. Same reasoning as
// createApiLimiter's own comment above, scoped to just these two routes instead.
export const createAuthRefreshLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

export const createAiLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many AI requests, please try again later." }
})

export const createWebhookLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many requests, please try again later." }
})