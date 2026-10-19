import { z } from "zod"
import { ROLES, GENDERS } from "../../db/schema/core.js"
import { objectId } from "../../utils/index.js"
import { phoneSchema } from "./phone.js"

export const passwordSchema = z.string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 characters")

const nameSchema = z.string().trim().min(1, "Name is required").max(191)
const lastNameSchema = z.string().trim().max(191).transform((v) => (v === "" ? null : v))
export const emailSchema = z.string().trim().toLowerCase().email().max(191)

const weekOffDays = z.array(z.number().int().min(0).max(6)).max(6, "Leave at least one working day")
    .transform((d) => [...new Set(d)].sort());

export const createUserSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: lastNameSchema.optional(),
    role: z.enum(ROLES),
    departmentId: objectId.optional(),
    storeId: objectId.optional(),
    gender: z.enum(GENDERS).optional(),
    dressTypeId: z.string().min(1).max(191).nullable().optional(),
    reportsToId: objectId.nullable().optional(),
    phone: phoneSchema.optional(),
    weekOffDays: weekOffDays.optional(),
    sendSetupCode: z.boolean().optional(),
});

export const updateUserSchema = createUserSchema.omit({ password: true, departmentId: true, storeId: true }).partial().extend({
    isActive: z.boolean().optional(),
    departmentId: objectId.nullable().optional(),
    storeId: objectId.nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    weekOffDays: weekOffDays.optional(),
    rank: z.number().int().min(1).max(10).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetUserPasswordSchema = z.object({
    password: passwordSchema,
});

export const updateOwnProfileSchema = z.object({
    firstName: nameSchema.optional(),
    lastName: lastNameSchema.optional(),
    phone: phoneSchema.optional(),
    weekOffDays: weekOffDays.optional(),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

export const changeOwnPasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
});
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;

export const listUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const offboardUserSchema = z.object({
    transferToUserId: z.string().min(1).optional(),
});
export type OffboardUserInput = z.infer<typeof offboardUserSchema>;

export const bulkUpdateUsersSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(100).transform((ids) => [...new Set(ids)]),
    departmentId: objectId.nullable().optional(),
    storeId: objectId.nullable().optional(),
    role: z.enum(ROLES).optional(),
}).refine((v) => v.departmentId !== undefined || v.storeId !== undefined || v.role !== undefined, {
    message: "Choose at least one change: department, store or role",
});
export type BulkUpdateUsersInput = z.infer<typeof bulkUpdateUsersSchema>;
