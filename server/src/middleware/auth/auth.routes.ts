// Express's Router lets us group related endpoints (all the /auth/* ones) together,
// instead of dumping everything directly onto the main app object.
import { Router, type Router as RouterType } from "express"
import type { Store } from "express-rate-limit"
// Bring in the controller functions that actually handle each request.
import { authController } from "./auth.controller.js"
import {
    createAuthLimiter,
    createAuthRefreshLimiter,
    createLoginLimiter,
    createLoginEmailLimiter,
    createForgotPasswordEmailLimiter,
} from "../rateLimiter/rateLimiter.js"

// A factory (not a static Router) so app.ts can thread the shared rate-limit store through, same
// as every other limited route — register/reset-password stay on the tight brute-force budget,
// login counts only failures (per IP and per email), forgot-password has a per-email hourly cap,
// refresh/logout get their own looser one (see rateLimiter.ts's comment).
// Takes the *store factory*, not a single store — every limiter needs its own Store
// instance (see config/redis.ts's own comment on createRedisRateLimitStoreFactory).
export const createAuthRouter = (rateLimitStoreFactory?: (prefix: string) => Store): RouterType => {
    const authRouter = Router()
    const tight = createAuthLimiter(rateLimitStoreFactory?.('auth'))
    const loose = createAuthRefreshLimiter(rateLimitStoreFactory?.('auth-refresh'))
    const loginByIp = createLoginLimiter(rateLimitStoreFactory?.('auth-login'))
    const loginByEmail = createLoginEmailLimiter(rateLimitStoreFactory?.('auth-login-email'))
    const forgotByEmail = createForgotPasswordEmailLimiter(rateLimitStoreFactory?.('auth-forgot-email'))
    const codeByEmail = createForgotPasswordEmailLimiter(rateLimitStoreFactory?.('auth-code-email'))

    // POST /auth/register - closed unless ALLOW_SELF_REGISTRATION=true (checked in the controller).
    authRouter.post('/register', tight, authController.register)
    // POST /auth/login - checks email/password and returns tokens if valid.
    authRouter.post('/login', loginByIp, loginByEmail, authController.login)
    // POST /auth/refresh - exchanges a valid refresh token (cookie) for a new access token.
    authRouter.post('/refresh', loose, authController.refresh)
    // POST /auth/logout - revokes the refresh token and clears the cookie.
    authRouter.post('/logout', loose, authController.logout)
    // POST /auth/forgot-password - emails a one-time reset link if the address is registered.
    authRouter.post('/forgot-password', tight, forgotByEmail, authController.forgotPassword)
    // POST /auth/reset-password - consumes that link's token to actually set a new password.
    authRouter.post('/reset-password', tight, authController.resetPassword)
    authRouter.post('/reset-password-code', tight, codeByEmail, authController.resetPasswordWithCode)

    return authRouter
}