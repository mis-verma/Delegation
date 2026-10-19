import { z } from "zod"
import { GENDERS } from "../../db/schema/core.js"

const nameSchema = z.string().trim().min(1, "Give the dress type a name").max(80, "Keep the name under 80 characters")

export const createDressTypeSchema = z.object({
    name: nameSchema,
    gender: z.enum(GENDERS).nullable().optional(),
})

export const updateDressTypeSchema = z.object({
    name: nameSchema.optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    isActive: z.boolean().optional(),
})

export type CreateDressTypeInput = z.infer<typeof createDressTypeSchema>
export type UpdateDressTypeInput = z.infer<typeof updateDressTypeSchema>
