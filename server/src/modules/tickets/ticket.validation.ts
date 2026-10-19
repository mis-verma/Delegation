import { z } from "zod"
import { TICKET_PRIORITIES, ASSIGNMENT_MODES, TICKET_STATUSES, RESTRICTED_STATUSES } from "../../db/schema/ticket.js"
import { objectId } from "../../utils/index.js"

export const createTicketSchema = z.object({
    title : z.string().min(1),
    description : z.string().min(1),
    priority :  z.enum(TICKET_PRIORITIES).optional(),
    assignmentMode : z.enum(ASSIGNMENT_MODES).optional(),
    assigneeId : objectId.optional(),
    storeId : objectId.optional(),
    categoryId : objectId.optional(),
    departmentId : objectId.optional(),
    tatHours : z.number().positive().optional(),
    startDate : z.string().datetime({ offset: true }).optional(),
    tagIds : z.array(objectId).max(12).optional(),
    reviewerIds : z.array(objectId).max(20).optional()
})
export const updateTicketSchema = createTicketSchema.partial().extend({
    status : z.enum(TICKET_STATUSES).optional(),
    assigneeId : objectId.nullable().optional(),
    startDate : z.string().datetime({ offset: true }).nullable().optional()
})

export const paginatioinSchema = z.object({
    page : z.coerce.number().int().min(1).default(1),
    limit : z.coerce.number().int().min(1).max(500).default(20),
    status : z.enum(TICKET_STATUSES).optional(),
    assigneeId : objectId.optional(),
    overdue : z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()).optional(),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional(),
    dateField : z.enum(["createdAt", "closedAt", "tatDueAt"]).optional().default("createdAt"),
    sla : z.enum(["overdue_open", "closed_late", "closed_on_time"]).optional(),
})

export const ticketSummaryQuerySchema = z.object({
    scope : z.enum(["mine", "visible"]).optional(),
})

export const tatReportQuerySchema = z.object({
    groupBy : z.enum(["day", "week", "month", "year", "none"]).default("day"),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional(),
    departmentId : objectId.optional(),
    storeId : objectId.optional(),
})

export const ownerStatsQuerySchema = z.object({
    scope : z.enum(["department", "store", "user", "org"]).default("org"),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional(),
    departmentId : objectId.optional(),
    storeId : objectId.optional(),
})

export const verifyTicketSchema = z.object({
    action : z.enum(["APPROVE", "REJECT"]),
    note : z.string().optional(),
}).refine(v => v.action === "APPROVE" || !!v.note?.trim(), {
    message : "A note is required when rejecting.",
    path : ["note"],
})

export const statusUpdateSchema = z.object({
    status : z.enum(RESTRICTED_STATUSES),
    remark : z.string().trim().optional(),
    captureMethod : z.enum(["LIVE", "GALLERY"]).optional(),
}).refine(v => v.status !== "ON_HOLD" || !!v.remark, {
    message : "A remark is required when putting a ticket on hold.",
    path : ["remark"],
})

export const declineTicketSchema = z.object({
    reason : z.string().trim().min(5, "Say why this ticket is declined.").max(1000),
})

export type DeclineTicketInput = z.infer<typeof declineTicketSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TatReportQuery = z.infer<typeof tatReportQuerySchema>;
export type OwnerStatsQuery = z.infer<typeof ownerStatsQuerySchema>;
export type VerifyTicketInput = z.infer<typeof verifyTicketSchema>;
export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;
