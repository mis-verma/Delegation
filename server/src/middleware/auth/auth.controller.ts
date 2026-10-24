import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { authService } from "./auth.service.js";
import { settingsService } from "../../modules/settings/settings.service.js";
import { loginSchema, loginCodeSchema, loginResendSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, resetPasswordCodeSchema } from "./auth.validation.js";
import { passwordOtpService } from "./passwordOtp.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";

const REFRESH_COOKIE = 'refreshToken';

const LEGACY_COOKIE_PATH = '/auth';

const cookieBase = () => ({
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
} as const);

const cookeiOptions = () => ({
    ...cookieBase(),
    path: '/',
    maxAge: settingsService.getCached().refreshTokenExpiresDays * 24 * 60 * 60 * 1000,
} as const);

const clearRefreshCookies = (res: Response) => {
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: LEGACY_COOKIE_PATH });
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: '/' });
};

const isNativeApp = (req: Request) => req.headers['x-client-platform'] === 'native';

const sendAuthResponse = (req: Request, res: Response, result: { accessToken: string; refreshToken: string; user: unknown; deviceToken?: string }) => {
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: LEGACY_COOKIE_PATH });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookeiOptions());
    res.json({
        accessToken: result.accessToken,
        ...(isNativeApp(req) ? { refreshToken: result.refreshToken } : {}),
        user: result.user,
        ...(result.deviceToken ? { deviceToken: result.deviceToken } : {}),
    });
};

const readRefreshToken = (req: Request): string | undefined =>
    req.cookies?.[REFRESH_COOKIE] ?? (isNativeApp(req) ? req.body?.refreshToken : undefined);

export const authController = {
    register: asyncHandler(async (req: Request, res: Response) => {
        if (!env.ALLOW_SELF_REGISTRATION) throw AppError.forbidden('Registration is closed. Ask an admin for an account.');
        const input = registerSchema.parse(req.body);
        const result = await authService.register(input);
        res.status(201);
        sendAuthResponse(req, res, result);
    }),

    login: asyncHandler(async (req: Request, res: Response) => {
        const input = loginSchema.parse(req.body);
        const result = await authService.login(input);
        if ('codeRequired' in result) {
            res.json(result);
            return;
        }
        sendAuthResponse(req, res, result);
    }),

    loginWithCode: asyncHandler(async (req: Request, res: Response) => {
        const input = loginCodeSchema.parse(req.body);
        sendAuthResponse(req, res, await authService.completeLoginWithCode(input));
    }),

    resendLoginCode: asyncHandler(async (req: Request, res: Response) => {
        const input = loginResendSchema.parse(req.body);
        await authService.resendLoginCode(input.challenge);
        res.json({ success: true });
    }),

    refresh: asyncHandler(async (req: Request, res: Response) => {
        const result = await authService.refresh(readRefreshToken(req));
        sendAuthResponse(req, res, result);
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
        await authService.logout(readRefreshToken(req));
        clearRefreshCookies(res);
        res.json({ success: true });
    }),

    forgotPassword: asyncHandler(async (req: Request, res: Response) => {
        const input = forgotPasswordSchema.parse(req.body);
        await passwordOtpService.requestReset(input.email);
        res.json({ success: true, message: 'If that email is registered, a code has been sent to it.' });
    }),

    resetPasswordWithCode: asyncHandler(async (req: Request, res: Response) => {
        const input = resetPasswordCodeSchema.parse(req.body);
        await passwordOtpService.resetWithCode(input);
        res.json({ success: true });
    }),

    resetPassword: asyncHandler(async (req: Request, res: Response) => {
        const input = resetPasswordSchema.parse(req.body);
        await authService.resetPassword(input);
        res.json({ success: true });
    }),
};