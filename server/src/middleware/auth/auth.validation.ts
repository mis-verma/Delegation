import { z } from "zod"
import { passwordSchema, emailSchema } from "../../modules/users/user.validation.js"

export const registerSchema = z.object({
    firstName : z.string().trim().min(1).max(191),
    lastName : z.string().trim().max(191).optional(),
    email : emailSchema,
    password : passwordSchema
})

export const loginSchema = z.object({
    email : z.string().trim().toLowerCase().email().max(191),
    password : z.string().min(1).max(1024),
    deviceToken : z.string().max(2000).optional()
})

export const loginCodeSchema = z.object({
    challenge : z.string().min(1).max(2000),
    code : z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code from the email."),
    rememberDevice : z.boolean().optional()
})

export const loginResendSchema = z.object({
    challenge : z.string().min(1).max(2000)
})

export const forgotPasswordSchema = z.object({
    email : z.string().trim().toLowerCase().email().max(191),
})

export const resetPasswordSchema = z.object({
    token : z.string().min(1),
    password : passwordSchema,
})

export const resetPasswordCodeSchema = z.object({
    email : z.string().trim().toLowerCase().email().max(191),
    code : z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code from the email."),
    password : passwordSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginCodeInput = z.infer<typeof loginCodeSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
