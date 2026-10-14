import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Store } from "express-rate-limit";
import jwt from 'jsonwebtoken'
import {env } from "../../config/env.js"


// One bucket per signed-in person (so a whole store sharing one wifi IP no longer shares one
// budget), falling back to the IP when there is no valid token. The token is verified, not just
// decoded: a forged one must not buy a fresh bucket. Memoised per request because both `limit`
// and `keyGenerator` need it.
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
            // Expired or invalid token: stays on the IP bucket; authenticate() rejects it properly.
        }
    }
    keyByRequest.set(req, key)
    return key
}


export const createApiLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 1000,
    // Signed-in people get 300/min each; requests with no usable token (login, refresh) share their
    // IP's bucket, which is bigger because a whole office can sit behind one address.
    limit: (req) => (userOrIpKey(req).startsWith("user:") ? 300 : 600),
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
    message: { success: false, message: "Too many requests, please try again later." }
})

export const createAuthLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})


// Per IP, counting failed sign-ins only. A request still counts while it is in flight (it is only
// refunded once it succeeds), and sign-in is slow, so a store of people opening the app at the same
// moment already had 20+ in flight and the rest got 429. Real protection against guessing is the
// per-email limiter below (10 failures / 15 min per account); this one is just a ceiling per address.
export const createLoginLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    skipSuccessfulRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
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
    // Redis trouble must slow nothing down: let the request through instead of failing it.
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
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
    message: { success: false, message: "Too many reset requests for this address, please try again later." }
})


export const createAuthRefreshLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: false,
    legacyHeaders: false,
    store,
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
    message: { success: false, message: "Too many auth attempts, please try again later." }
})

export const createAiLimiter = (store?: Store) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
    message: { success: false, message: "Too many AI requests, please try again later." }
})

export const createWebhookLimiter = (store?: Store) => rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    // Redis trouble must slow nothing down: let the request through instead of failing it.
    passOnStoreError: true,
    message: { success: false, message: "Too many requests, please try again later." }
})