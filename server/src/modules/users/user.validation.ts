import { z } from "zod"
import { ROLES, GENDERS } from "../../db/schema/core.js"
import { objectId } from "../../utils/index.js"

export const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    role: z.enum(ROLES),
    departmentId: objectId.optional(),
    storeId: objectId.optional(),
    // Picks which uniform checklist an audit gives this person (see ChecklistDefinitionItem).
    gender: z.enum(GENDERS).optional(),
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
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Admin-initiated password reset (not the self-service email-token flow in auth.service.ts) —
// an ADMIN/PC sets a user's password directly, e.g. when someone's locked out.
export const resetUserPasswordSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

// A user editing their own profile — deliberately narrower than updateUserSchema: no role,
// department, store, isActive, or email. Email is left out of self-service entirely (it's the
// login identifier, so changing it needs its own verification flow, not a plain profile field).
export const updateOwnProfileSchema = z.object({
    firstName: z.string().trim().min(1, 'First name is required').optional(),
    lastName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    // Self-service on purpose: staff set their own weekly off so they don't get checklists that day.
    weekOffDays: weekOffDays.optional(),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

// A user changing their own password — unlike resetUserPasswordSchema (an admin setting someone
// else's password directly), this one has to prove they know the current one first.
export const changeOwnPasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
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
