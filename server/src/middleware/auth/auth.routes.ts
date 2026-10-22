import { Router, type Router as RouterType } from "express"
import type { Store } from "express-rate-limit"
import { authController } from "./auth.controller.js"
import {
    createAuthLimiter,
    createAuthRefreshLimiter,
    createLoginLimiter,
    createLoginEmailLimiter,
    createForgotPasswordEmailLimiter,
} from "../rateLimiter/rateLimiter.js"

export const createAuthRouter = (rateLimitStoreFactory?: (prefix: string) => Store): RouterType => {
    const authRouter = Router()
    const tight = createAuthLimiter(rateLimitStoreFactory?.('auth'))
    const loose = createAuthRefreshLimiter(rateLimitStoreFactory?.('auth-refresh'))
    const loginByIp = createLoginLimiter(rateLimitStoreFactory?.('auth-login'))
    const loginByEmail = createLoginEmailLimiter(rateLimitStoreFactory?.('auth-login-email'))
    const forgotByEmail = createForgotPasswordEmailLimiter(rateLimitStoreFactory?.('auth-forgot-email'))
    const codeByEmail = createForgotPasswordEmailLimiter(rateLimitStoreFactory?.('auth-code-email'))

    authRouter.post('/register', tight, authController.register)
    authRouter.post('/login', loginByIp, loginByEmail, authController.login)
    authRouter.post('/login/verify', loginByIp, authController.loginWithCode)
    authRouter.post('/login/resend', loginByIp, authController.resendLoginCode)
    authRouter.post('/refresh', loose, authController.refresh)
    authRouter.post('/logout', loose, authController.logout)
    authRouter.post('/forgot-password', tight, forgotByEmail, authController.forgotPassword)
    authRouter.post('/reset-password', tight, authController.resetPassword)
    authRouter.post('/reset-password-code', tight, codeByEmail, authController.resetPasswordWithCode)

    return authRouter
}