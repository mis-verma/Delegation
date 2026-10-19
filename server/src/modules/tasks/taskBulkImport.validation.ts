import { z } from "zod"
import { objectId } from "../../utils/index.js"

export const taskBulkImportPublishSchema = z.object({
    rows: z.array(z.object({
        rowIndex: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string().optional(),
        assigneeId: objectId.optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        startDate: z.string().datetime().optional(),
        dueDate: z.string().datetime().optional(),
        departmentId: objectId.optional(),
        tagIds: z.array(objectId).max(12).optional(),
    })).min(1, "At least one row is required"),
})

export type TaskBulkImportPublishInput = z.infer<typeof taskBulkImportPublishSchema>
