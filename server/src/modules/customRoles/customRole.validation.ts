import { z } from "zod"
import { ROLES } from "../../db/schema/core.js"

export const createCustomRoleSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(191),
    baseRole: z.enum(ROLES),
    description: z.string().trim().max(255).optional().transform((v) => (v ? v : undefined)),
    isActive: z.boolean().optional(),
})

export const updateCustomRoleSchema = createCustomRoleSchema.partial()

export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>
