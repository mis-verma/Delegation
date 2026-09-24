// Express's Router lets us group related endpoints (all the /auth/* ones) together,
// instead of dumping everything directly onto the main app object.
import { Router, type Router as RouterType } from "express"
import type { Store } from "express-rate-limit"
// Bring in the controller functions that actually handle each request.
import { authController } from "./auth.controller.js"
import { createAuthLimiter, createAuthRefreshLimiter } from "../rateLimiter/rateLimiter.js"

// A factory (not a static Router) so app.ts can thread the shared rate-limit store through, same
// as every other limited route — register/login/forgot-password/reset-password stay on the tight
// brute-force budget, refresh/logout get their own looser one (see rateLimiter.ts's comment).
// Takes the *store factory*, not a single store — these two limiters each need their own Store
// instance (see config/redis.ts's own comment on createRedisRateLimitStoreFactory).
export const createAuthRouter = (rateLimitStoreFactory?: (prefix: string) => Store): RouterType => {
    const authRouter = Router()
    const tight = createAuthLimiter(rateLimitStoreFactory?.('auth'))
    const loose = createAuthRefreshLimiter(rateLimitStoreFactory?.('auth-refresh'))

    // POST /auth/register - creates a new account and logs it in immediately.
    authRouter.post('/register', tight, authController.register)
    // POST /auth/login - checks email/password and returns tokens if valid.
    authRouter.post('/login', tight, authController.login)
    // POST /auth/refresh - exchanges a valid refresh token (cookie) for a new access token.
    authRouter.post('/refresh', loose, authController.refresh)
    // POST /auth/logout - revokes the refresh token and clears the cookie.
    authRouter.post('/logout', loose, authController.logout)
    // POST /auth/forgot-password - emails a one-time reset link if the address is registered.
    authRouter.post('/forgot-password', tight, authController.forgotPassword)
    // POST /auth/reset-password - consumes that link's token to actually set a new password.
    authRouter.post('/reset-password', tight, authController.resetPassword)

    return authRouter
}