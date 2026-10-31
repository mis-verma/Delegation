import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Store } from "express-rate-limit";
import jwt from 'jsonwebtoken'
import {env } from "../../config/env.js"

const keyByRequest = new WeakMap<Request, string>()
const userOrIpKey = (req: Request): string => {
    const known = keyByRequest.get(req)
    if (known) return known

    let key = `ip:${ipKeyGenerator(req.ip ?? "")}`
    const auth = req.headers.authorization
    if (auth?.startsWith("Bearer ")) {
        try {
            const payload = jwt.verify(auth.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as { sub?: string }
            if (payload.sub) key = `user:${payload.sub}`
        } catch {
        }
    }
    keyByRequest.set(req, key)
    return key
}

export const createApiLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 1000,
    limit: (req) => (userOrIpKey(req).startsWith("user:") ? 300 : 600),
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many requests, please try again later." }
})

export const createAuthLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

export const createLoginLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    skipSuccessfulRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

const emailKey = (req: Request): string => {
    const email = (req.body as { email?: unknown } | undefined)?.email
    if (typeof email === "string" && email.trim()) return `email:${email.trim().toLowerCase().slice(0, 191)}`
    return `ip:${ipKeyGenerator(req.ip ?? "")}`
}

const emailAndIpKey = (req: Request): string => `${emailKey(req)}|${ipKeyGenerator(req.ip ?? "")}`

export const createLoginEmailLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: emailAndIpKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many failed sign-in attempts, please try again later." }
})

export const createLoginEmailCeilingLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    skipSuccessfulRequests: true,
    keyGenerator: emailKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many failed sign-in attempts for this account, please try again later." }
})

export const createForgotPasswordEmailLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: emailKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many reset requests for this address, please try again later." }
})

export const createAuthRefreshLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

export const createAiLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many AI requests, please try again later." }
})

export const createWebhookLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many requests, please try again later." }
})

export const createPasswordChangeLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    keyGenerator: userOrIpKey,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { success: false, message: "Too many wrong password attempts. Try again in a few minutes." }
})
