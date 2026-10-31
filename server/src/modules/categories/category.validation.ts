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

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
