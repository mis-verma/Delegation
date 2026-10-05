import { z } from "zod"
import { ROLES, GENDERS, DRESS_CODES } from "../../db/schema/core.js"
import { objectId } from "../../utils/index.js"
import { phoneSchema } from "./phone.js"

// ONE password rule for every place a password is set: admin create, admin reset, own change,
// register and the emailed reset link. 72 is bcrypt's limit (it ignores anything past 72 bytes).
export const passwordSchema = z.string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 characters")

const nameSchema = z.string().trim().min(1, "Name is required").max(191)
// Empty means "no last name" (null), so a cleared field really clears it.
const lastNameSchema = z.string().trim().max(191).transform((v) => (v === "" ? null : v))
export const emailSchema = z.string().trim().toLowerCase().email().max(191)

export const createUserSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: lastNameSchema.optional(),
    role: z.enum(ROLES),
    departmentId: objectId.optional(),
    storeId: objectId.optional(),
    // Picks which uniform checklist an audit gives this person (see ChecklistDefinitionItem).
    gender: z.enum(GENDERS).optional(),
    // Women only: which dress style an audit checks (null = the usual female list). The service
    // drops it for anyone who is not female.
    dressCode: z.enum(DRESS_CODES).nullable().optional(),
    // Digits only once parsed; "" becomes null (see phone.ts).
    phone: phoneSchema.optional(),
});

// Password changes aren't handled through this update endpoint (see user.service.ts's
// UpdateUserInput comment) — same reason it's left out of update here, only create needs it.
// departmentId/storeId are overridden to also accept `null` (unlike create) so an admin can
// explicitly clear a user's department/store, not just set a new one — mirrors
// ticket.validation.ts's assigneeId.
// Weekly day(s) off, 0 = Sunday … 6 = Saturday — the daily checklist generator leaves the person
// off that day's runs. Up to 6 (a whole week off isn't a week-off). Empty array clears it.
const weekOffDays = z.array(z.number().int().min(0).max(6)).max(6, "Leave at least one working day")
    .transform((d) => [...new Set(d)].sort());

export const updateUserSchema = createUserSchema.omit({ password: true, departmentId: true, storeId: true }).partial().extend({
    isActive: z.boolean().optional(),
    departmentId: objectId.nullable().optional(),
    storeId: objectId.nullable().optional(),
    // null clears it (back to "not set").
    gender: z.enum(GENDERS).nullable().optional(),
    weekOffDays: weekOffDays.optional(),
    // Explicit rank wins over the role's default when the role changes.
    rank: z.number().int().min(1).max(10).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Admin-initiated password reset (not the self-service email-token flow in auth.service.ts) —
// an ADMIN/PC sets a user's password directly, e.g. when someone's locked out.
export const resetUserPasswordSchema = z.object({
    password: passwordSchema,
});

// A user editing their own profile — deliberately narrower than updateUserSchema: no role,
// department, store, isActive, or email. Email is left out of self-service entirely (it's the
// login identifier, so changing it needs its own verification flow, not a plain profile field).
export const updateOwnProfileSchema = z.object({
    firstName: nameSchema.optional(),
    lastName: lastNameSchema.optional(),
    // "" clears the phone (null); anything else must be a valid number and is stored as digits.
    phone: phoneSchema.optional(),
    // Self-service on purpose: staff set their own weekly off so they don't get checklists that day.
    weekOffDays: weekOffDays.optional(),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

// A user changing their own password — unlike resetUserPasswordSchema (an admin setting someone
// else's password directly), this one has to prove they know the current one first.
export const changeOwnPasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
});
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;

// Both optional (unlike ticket.validation.ts's paginatioinSchema): the admin directory list page
// passes page+limit to get a paginated slice, but every other caller of GET /users (OrgStructure's
// tree, assignable-user pickers relying on the full roster, etc.) calls it with neither and must
// keep getting the complete unpaginated array back, unchanged.
export const listUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Switching a person off. `transferToUserId` is who takes over their open tickets, tasks, checklists
// and categories; it's required only when they actually hold some (the service checks that).
export const offboardUserSchema = z.object({
    transferToUserId: z.string().min(1).optional(),
});
export type OffboardUserInput = z.infer<typeof offboardUserSchema>;

// PATCH /users/bulk: move many people at once. At least one change is required; ids are deduped.
export const bulkUpdateUsersSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(100).transform((ids) => [...new Set(ids)]),
    departmentId: objectId.nullable().optional(),
    storeId: objectId.nullable().optional(),
    role: z.enum(ROLES).optional(),
}).refine((v) => v.departmentId !== undefined || v.storeId !== undefined || v.role !== undefined, {
    message: "Choose at least one change: department, store or role",
});
export type BulkUpdateUsersInput = z.infer<typeof bulkUpdateUsersSchema>;
