import { Router, type Router as RouterType } from "express"
import type { Store } from "express-rate-limit"
import { authController } from "./auth.controller.js"
import {
    createAuthLimiter,
    createAuthRefreshLimiter,
    createLoginLimiter,
    createLoginEmailLimiter,
    createLoginEmailCeilingLimiter,
    createForgotPasswordEmailLimiter,
} from "../rateLimiter/rateLimiter.js"

export const createAuthRouter = (rateLimitStoreFactory?: (prefix: string) => Store): RouterType => {
    const authRouter = Router()
    const tight = createAuthLimiter(rateLimitStoreFactory?.('auth'))
    const loose = createAuthRefreshLimiter(rateLimitStoreFactory?.('auth-refresh'))
    const loginByIp = createLoginLimiter(rateLimitStoreFactory?.('auth-login'))
    const loginByEmail = createLoginEmailLimiter(rateLimitStoreFactory?.('auth-login-email'))
    const loginCeiling = createLoginEmailCeilingLimiter(rateLimitStoreFactory?.('auth-login-ceiling'))
    const resendByIp = createAuthLimiter(rateLimitStoreFactory?.('auth-resend'))
    const memoryIp = createLoginLimiter()
    const memoryEmail = createLoginEmailLimiter()
    const memoryTight = createAuthLimiter()
    const forgotByEmail = createForgotPasswordEmailLimiter(rateLimitStoreFactory?.('auth-forgot-email'))
    const codeByEmail = createForgotPasswordEmailLimiter(rateLimitStoreFactory?.('auth-code-email'))

    authRouter.post('/register', tight, authController.register)
    authRouter.post('/login', loginByIp, memoryIp, loginByEmail, memoryEmail, loginCeiling, authController.login)
    authRouter.post('/login/verify', loginByIp, memoryIp, authController.loginWithCode)
    authRouter.post('/login/resend', resendByIp, memoryTight, authController.resendLoginCode)
    authRouter.post('/refresh', loose, authController.refresh)
    authRouter.post('/logout', loose, authController.logout)
    authRouter.post('/forgot-password', tight, memoryTight, forgotByEmail, authController.forgotPassword)
    authRouter.post('/reset-password', tight, authController.resetPassword)
    authRouter.post('/reset-password-code', tight, memoryTight, codeByEmail, authController.resetPasswordWithCode)

    return authRouter
}