import { z } from "zod"
import { MAX_TAT_HOURS } from "../../utils/tatLimits.js"
import { TICKET_PRIORITIES } from "../../db/schema/ticket.js"
import { objectId } from "../../utils/index.js"

export const ticketBulkImportPublishSchema = z.object({
    rows: z.array(z.object({
        rowIndex: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string().min(1),
        assigneeId: objectId.optional(),
        priority: z.enum(TICKET_PRIORITIES).optional(),
        departmentId: objectId.optional(),
        storeId: objectId.optional(),
        categoryId: objectId.optional(),
        tatHours: z.number().positive().max(MAX_TAT_HOURS).optional(),
        tagIds: z.array(objectId).max(12).optional(),
    })).min(1, "At least one row is required"),
})

export type TicketBulkImportPublishInput = z.infer<typeof ticketBulkImportPublishSchema>
