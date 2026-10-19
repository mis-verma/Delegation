import { z } from 'zod';
import { objectId } from "../../utils/index.js"

export const createChecklistSchema = z.object({
  title: z.string().min(1),
  items: z.array(z.object({
    label: z.string().min(1),
    assigneeId: objectId.optional(),
    dueAt: z.string().datetime().optional(),
    requiredImageCount: z.number().int().min(0).optional(),
    maxImageCount: z.number().int().min(0).optional(),
    requiresLivePhoto: z.boolean().optional(),
    remarks: z.string().max(2000).optional(),
  })).optional(),
});

export const updateChecklistItemSchema = z.object({
  label: z.string().min(1).optional(),
  assigneeId: objectId.nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  requiredImageCount: z.number().int().min(0).optional(),
  maxImageCount: z.number().int().min(0).nullable().optional(),
  requiresLivePhoto: z.boolean().optional(),
  isDone: z.literal(false).optional(),
});

export const updateRemarksSchema = z.object({
  remarks: z.string().max(2000),
});

export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
export type UpdateRemarksInput = z.infer<typeof updateRemarksSchema>;