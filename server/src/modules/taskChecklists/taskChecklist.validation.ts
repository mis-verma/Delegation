import {z } from "zod"
import { objectId } from "../../utils/index.js"

export const createTaskChecklistSchema = z.object({
    title : z.string().trim().min(1).max(191),
    items : z.array(z.object({
      label : z.string().trim().min(1).max(191),
      assigneeId : objectId.optional(),
      dueAt : z.string().datetime().optional(),
      requiredImageCount : z.number().int().min(0).optional(),
      maxImageCount : z.number().int().min(0).optional(),
      requiresLivePhoto : z.boolean().optional(),
      remarks : z.string().max(2000).optional(),
    }).refine((item) => item.maxImageCount === undefined || (item.requiredImageCount ?? 0) <= item.maxImageCount, {
      message : "Required photos can't be more than the most photos allowed.",
      path : ["requiredImageCount"],
    })).optional(),
})

export const updateTaskChecklistItemSchema = z.object({
    label :  z.string().trim().min(1).max(191).optional(),
    assigneeId : objectId.nullable().optional(),
    dueAt : z.string().datetime().nullable().optional(),
    requiredImageCount : z.number().int().min(0).optional(),
    maxImageCount : z.number().int().min(0).nullable().optional(),
    requiresLivePhoto : z.boolean().optional(),
    isDone : z.literal(false).optional()
})

export const updateRemarksSchema = z.object({
    remarks : z.string().max(2000),
})

export type CreateTaskChecklistInput = z.infer<typeof createTaskChecklistSchema>
export type UpdateTaskChecklistItemInput = z.infer<typeof updateTaskChecklistItemSchema>
export type UpdateRemarksInput = z.infer<typeof updateRemarksSchema>
