import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Store } from "express-rate-limit";


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


export const createLoginLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})


const emailKey = (req: Request): string => {
    const email = (req.body as { email?: unknown } | undefined)?.email
    if (typeof email === "string" && email.trim()) return `email:${email.trim().toLowerCase().slice(0, 191)}`
    return `ip:${ipKeyGenerator(req.ip ?? "")}`
}

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


export const createForgotPasswordEmailLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: emailKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    message: { success: false, message: "Too many reset requests for this address, please try again later." }
})


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