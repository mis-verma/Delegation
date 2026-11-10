import { z } from "zod"
import { tatHoursSchema } from "../../utils/tatLimits.js"

export const createCategorySchema = z.object({
    name : z.string().min(1),
    departmentId : z.string().min(1),
    assigneeIds : z.array(z.string()).optional(),
    tatHours : tatHoursSchema.nullable().optional(),
    priority : z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
    tagIds : z.array(z.string().min(1)).max(12).optional(),
    isActive : z.boolean().optional()
})

export const updateCategorySchema = createCategorySchema.partial()

export const createSubcategorySchema = z.object({
    name : z.string().trim().min(1).max(191),
    priority : z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
    tatHours : tatHoursSchema.nullable().optional(),
    assigneeId : z.string().min(1).nullable().optional(),
    tagIds : z.array(z.string().min(1)).max(12).optional(),
    isActive : z.boolean().optional(),
    sortOrder : z.number().int().min(0).max(10000).optional()
})

export const updateSubcategorySchema = createSubcategorySchema.partial()

export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>
export type UpdateSubcategoryInput = z.infer<typeof updateSubcategorySchema>

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
