import { z } from "zod"
import { TICKET_PRIORITIES } from "../../db/schema/ticket.js"
import { objectId } from "../../utils/index.js"

export const ticketBulkImportPublishSchema = z.object({
    rows: z.array(z.object({
        // The original row number from the uploaded file — carried through so a failure in the
        // publish summary points at the row the admin can actually find in their spreadsheet,
        // not its position in the (possibly-excluded-down) batch that was submitted.
        rowIndex: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string().min(1),
        assigneeId: objectId.optional(),
        priority: z.enum(TICKET_PRIORITIES).optional(),
        departmentId: objectId.optional(),
        storeId: objectId.optional(),
        categoryId: objectId.optional(),
        tatHours: z.number().positive().optional(),
        tagIds: z.array(objectId).max(12).optional(),
    })).min(1, "At least one row is required"),
})

export type TicketBulkImportPublishInput = z.infer<typeof ticketBulkImportPublishSchema>
