import { z } from "zod"
import { objectId } from "../../utils/index.js"

export const createDepartmentSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(191),
    isActive: z.boolean().optional(),
    storeId: objectId.optional(),
})

// storeId is overridden to also accept `null` (unlike create) so an admin can explicitly clear a
// department's store, not just set a new one — mirrors user.validation.ts's departmentId/storeId.
export const updateDepartmentSchema = createDepartmentSchema.omit({ storeId: true }).partial().extend({
    storeId: objectId.nullable().optional(),
})

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>

// Both optional — see user.validation.ts's listUsersQuerySchema for why: the admin directory
// list page passes page+limit, every other caller (dropdowns, org structure) passes neither and
// must keep getting the full list back.
export const listDepartmentsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
