import { z } from "zod"

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordCodeSchema = z
  .object({
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    code: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code from the email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordCodeFields = z.infer<typeof resetPasswordCodeSchema>;
export type LoginFields  = z.infer<typeof loginSchema>;
export type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFields  = z.infer<typeof resetPasswordSchema>;
