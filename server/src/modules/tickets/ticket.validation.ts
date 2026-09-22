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
    // Labels. Capped the same as Task's — a ticket carrying more than a dozen isn't labelled,
    // it's noise. Reuses Task's own `tags` table (see ticketTags in db/schema/ticket.ts).
    tagIds : z.array(objectId).max(12).optional(),
    // Explicit reviewers — additive on top of the role-based verify rule (ADMIN/PC always,
    // MANAGER/HOD within the ticket's own department). Same convention as Task's reviewerIds.
    reviewerIds : z.array(objectId).max(20).optional()
})
export const updateTicketSchema = createTicketSchema.partial().extend({
    status : z.enum(TICKET_STATUSES).optional(),
    assigneeId : objectId.nullable().optional()
})

export const paginatioinSchema = z.object({
    page : z.coerce.number().int().min(1).default(1),
    // Board/list views deliberately request up to 500 in one shot to bucket/filter client-side
    // (see BOARD_LIMIT in client's tickets/hook.ts) — cap must cover that, not just the 20-per-page
    // paginated list default.
    limit : z.coerce.number().int().min(1).max(500).default(20),
    status : z.enum(TICKET_STATUSES).optional(),
    // Lets an ADMIN/PC filter the list down to one person's tickets (e.g. the Team Overview
    // drill-down) — ignored for a non-privileged caller, same treatment as task.service.ts's
    // filterUserId.
    assigneeId : objectId.optional(),
    // Backs the on-time/overdue stat-card drill-downs on OrgOverview (AnalyticsSummaryStrip) —
    // the exact tickets behind a real ownerStats() count, not a client-side filter over whatever
    // page happened to already be loaded.
    overdue : z.coerce.boolean().optional(),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional(),
    // The "On-time completion" drilldown scopes its from/to by closedAt instead of createdAt, to
    // match tatReport's own closedAt-scoped bucketing (see ticket.service.ts#tatReport) — the stat
    // card's percentage and its drilldown's row set now describe the exact same population.
    dateField : z.enum(["createdAt", "closedAt"]).optional().default("createdAt"),
})

export const tatReportQuerySchema = z.object({
    groupBy : z.enum(["hour", "day", "week", "month", "year"]).default("day"),
    // Client sends computeRange()'s toISOString() output — matching createTaskSchema's
    // startDate/dueDate convention here catches a malformed value as a clean 400 instead of
    // an Invalid Date silently reaching the raw SQL template in tatReport().
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional(),
    // Only honored for ADMIN/PC callers — MANAGER/SENIOR get their own departmentId/storeId
    // forced by the controller regardless of what's sent here (see ticket.controller.ts).
    departmentId : objectId.optional(),
    storeId : objectId.optional(),
})

// Same from/to convention as tatReportQuerySchema above — a malformed value fails validation as a
// clean 400 instead of an Invalid Date silently reaching ownerStats()'s raw SQL template.
export const ownerStatsQuerySchema = z.object({
    scope : z.enum(["department", "store", "user", "org"]).default("org"),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional(),
    // Only honored for ADMIN/PC callers — MANAGER/SENIOR get their own departmentId/storeId
    // forced by the controller regardless of what's sent here (see ticket.controller.ts).
    departmentId : objectId.optional(),
    storeId : objectId.optional(),
})

// PC/Admin verification action on a ticket that's PENDING_APPROVAL: APPROVE closes it for good,
// REJECT bounces it back to IN_PROGRESS. A note is required when rejecting so the assignee
// knows what to fix; optional when approving.
export const verifyTicketSchema = z.object({
    action : z.enum(["APPROVE", "REJECT"]),
    note : z.string().optional(),
}).refine(v => v.action === "APPROVE" || !!v.note?.trim(), {
    message : "A note is required when rejecting.",
    path : ["note"],
})

// The restricted status-update flow: a non-verifier (assignee/creator/manager) moving a ticket
// to In Progress, On Hold, or In Review (labelled "Completed" for a plain USER — see
// ticketStatusLabel.ts on the client) must always explain why via a remark. Photos are optional
// evidence, captured either live or picked from the gallery — captureMethod is a plain string
// here (not an enum) since it arrives as a multipart form field.
export const statusUpdateSchema = z.object({
    status : z.enum(RESTRICTED_STATUSES),
    remark : z.string().trim().min(1, "A remark is required"),
    captureMethod : z.enum(["LIVE", "GALLERY"]).optional(),
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TatReportQuery = z.infer<typeof tatReportQuerySchema>;
export type OwnerStatsQuery = z.infer<typeof ownerStatsQuerySchema>;
export type VerifyTicketInput = z.infer<typeof verifyTicketSchema>;
export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;
