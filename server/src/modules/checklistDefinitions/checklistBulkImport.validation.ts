import { z } from "zod"

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:mm")

export const checklistBulkImportPublishSchema = z.object({
    rows: z.array(z.object({
        checklistDefinitionId: z.string().min(1),
        storeId: z.string().min(1),
        userId: z.string().min(1),
    })).min(1, "At least one row is required"),
    startDate: z.string().optional(),
    opensTime: timeOfDay.optional(),
    cutoffTime: timeOfDay.optional(),
})

export type ChecklistBulkImportPublishInput = z.infer<typeof checklistBulkImportPublishSchema>
