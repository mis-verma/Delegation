import { z } from "zod"
import { CHECKLIST_TEMPLATE_TARGETS } from "../../db/schema/ticket.js"

const templateItemShape = z.object({
    label: z.string().trim().min(1).max(191),
    order: z.number().int().min(0).optional(),
    requiredImageCount: z.number().int().min(0).optional(),
    maxImageCount: z.number().int().min(0).optional(),
    requiresLivePhoto: z.boolean().optional(),
    defaultAssigneeId: z.string().min(1).optional(),
})

export const createChecklistTemplateSchema = z.object({
    name: z.string().trim().min(1).max(191),
    appliesTo: z.enum(CHECKLIST_TEMPLATE_TARGETS),
    departmentId: z.string().min(1).optional(),
    items: z.array(templateItemShape).optional(),
})

export const updateChecklistTemplateSchema = z.object({
    name: z.string().trim().min(1).max(191).optional(),
    departmentId: z.string().min(1).nullable().optional(),
})

export const createChecklistTemplateItemSchema = templateItemShape

export const updateChecklistTemplateItemSchema = z.object({
    label: z.string().trim().min(1).max(191).optional(),
    order: z.number().int().min(0).optional(),
    requiredImageCount: z.number().int().min(0).optional(),
    maxImageCount: z.number().int().min(0).nullable().optional(),
    requiresLivePhoto: z.boolean().optional(),
    defaultAssigneeId: z.string().min(1).nullable().optional(),
})

export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>
export type UpdateChecklistTemplateInput = z.infer<typeof updateChecklistTemplateSchema>
export type CreateChecklistTemplateItemInput = z.infer<typeof createChecklistTemplateItemSchema>
export type UpdateChecklistTemplateItemInput = z.infer<typeof updateChecklistTemplateItemSchema>