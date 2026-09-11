import { z } from "zod"
import { objectId } from "../../utils/index.js"

export const taskBulkImportPublishSchema = z.object({
    rows: z.array(z.object({
        // The original row number from the uploaded file — carried through so a failure in the
        // publish summary points at the row the admin can actually find in their spreadsheet,
        // not its position in the (possibly-excluded-down) batch that was submitted.
        rowIndex: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string().optional(),
        assigneeId: objectId.optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        // Full ISO datetime, already normalized client-side from whatever the spreadsheet's
        // Start/Due Date columns contained — matches createTaskSchema's own strict format so
        // taskService.create() can take these rows exactly like a normal create request.
        startDate: z.string().datetime().optional(),
        dueDate: z.string().datetime().optional(),
        departmentId: objectId.optional(),
        tagIds: z.array(objectId).max(12).optional(),
    })).min(1, "At least one row is required"),
})

export type TaskBulkImportPublishInput = z.infer<typeof taskBulkImportPublishSchema>
