import { z } from "zod"
import { objectId } from "../../utils/index.js"

export const createDepartmentSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(191),
    isActive: z.boolean().optional(),
    storeId: objectId.optional(),
    headOptional: z.boolean().optional(),
    weekOffDays: z.array(z.number().int().min(0).max(6)).max(6, "Leave at least one working day").optional(),
})

export const updateDepartmentSchema = createDepartmentSchema.omit({ storeId: true }).partial().extend({
    storeId: objectId.nullable().optional(),
})

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>

export const listDepartmentsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
