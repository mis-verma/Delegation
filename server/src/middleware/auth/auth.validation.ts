// Import Zod - a schema validation library that lets us describe the "shape" data should have,
// and automatically reject/report anything that doesn't match (e.g. missing fields, bad email format).
import { z } from "zod"
// The one password rule shared by every place a password is set (admin create/reset, own change,
// register, emailed reset) — lives with the user schemas.
import { passwordSchema, emailSchema } from "../../modules/users/user.validation.js"

// Schema describing what a valid "register" (sign up) request body should look like.
// If the incoming JSON doesn't match this shape, Zod throws a ZodError, which the central
// errorHandler.ts turns into a friendly 400 response with per-field error messages.
export const registerSchema = z.object({
    // First name must be a non-empty string (trimmed, at most 191 chars - the column width).
    firstName : z.string().trim().min(1).max(191),
    // Last name is a string, but optional - the user doesn't have to provide it.
    lastName : z.string().trim().max(191).optional(),
    // Email is trimmed, lowercased and must look like a valid address.
    email : emailSchema,
    password : passwordSchema
})

// Schema describing what a valid "login" request body should look like.
export const loginSchema = z.object({
    // Email must be a valid email string, same rule as registration.
    email : z.string().trim().toLowerCase().email().max(191),
    // Password just needs to be present (min 1 character) - we don't re-check strength on login,
    // only when it is set, since an existing account's password could pre-date current rules.
    password : z.string().min(1).max(1024)
})

// Schema for "forgot password" — just the email of the account to send a reset link to.
export const forgotPasswordSchema = z.object({
    email : z.string().trim().toLowerCase().email().max(191),
})

// Schema for actually resetting the password once the user has clicked the emailed link.
// `token` is the raw reset token from the URL. A reset link is exactly the credential an attacker
// who intercepted it would use raw, with no browser form in the loop — so the password rule can't
// be a client-only one; it is the same shared passwordSchema as everywhere else.
export const resetPasswordSchema = z.object({
    token : z.string().min(1),
    password : passwordSchema,
})

// TypeScript trick: z.infer<> reads the Zod schema and generates a matching TypeScript type
// automatically, so we don't hand-write an interface that could drift out of sync with the schema.
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
