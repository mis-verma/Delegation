import { TICKET_PRIORITIES } from "../../db/schema/ticket.js"
import { z } from "zod"
import { CAPTURE_METHODS } from "../../db/schema/task.js"
import { objectId } from "../../utils/index.js"

// Every field below only matters for its own itemType — checklistInstance.service.ts's
// setItemDone dispatches to the one relevant validator/persist step per item's itemType and
// ignores the rest, so sending an unrelated field is a harmless no-op.
export const setChecklistInstanceItemDoneSchema = z.object({
    isDone: z.boolean(),
    numericValue: z.number().optional(),      // NUMBER_ENTRY, RATING, CASH_TALLY
    booleanAnswer: z.enum(["YES", "NO"]).optional(), // YES_NO, PASS_FAIL
    textValue: z.string().optional(),          // MULTIPLE_CHOICE, DROPDOWN, TEXT_BOX, QR_SCAN
    dateValue: z.string().optional(),          // DATE_TIME (ISO string)
    gpsLat: z.number().min(-90).max(90).optional(),   // GPS
    gpsLng: z.number().min(-180).max(180).optional(), // GPS
    gpsAccuracy: z.number().min(0).optional(),        // GPS
    signatureValue: z.string().optional(),       // SIGNATURE, DUAL_SIGNATURE
    secondSignatureValue: z.string().optional(), // DUAL_SIGNATURE
    conditionalReasonValue: z.string().optional(), // ASK_REASON conditional action
    // Free-text note, any item type. null clears it. Required client-side once overdue+not-done,
    // and required server-side when marking an item Not applicable.
    remarks: z.string().trim().max(1000).nullable().optional(),
    // Mark the item "Not applicable" (with isDone: true). Omit for a normal completion.
    notApplicable: z.boolean().optional(),
})

// Mirrors task.validation.ts's complianceReportQuerySchema — same groupBy/storeId/from/to
// shape, so the client can drive both reports from one shared control.
// from/to: an ISO datetime (the instant is converted to the org-local day it falls on, see
// checklistReportRange.ts) or a plain org-local YYYY-MM-DD. groupBy 'none' = one bucket for the
// whole range; there is no 'hour' bucket. Without from/to the range is the last 12 buckets
// (week/month/year) or 30 days (day/none), never unbounded.
const reportBoundary = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date or datetime")])

// Same boundary for the list/summary endpoints, but a cleared filter arrives as "from=" and means
// "no filter". Garbage is a 400 here instead of an Invalid Date reaching the SQL.
const optionalBoundary = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), reportBoundary.optional())

export const checklistInstanceComplianceReportQuerySchema = z.object({
    groupBy: z.enum(["day", "week", "month", "year", "none"]).default("day"),
    storeId: objectId.optional(),
    // Narrows the whole report to runs this person is assigned to.
    assigneeId: objectId.optional(),
    from: reportBoundary.optional(),
    to: reportBoundary.optional(),
})

// The runs behind one score cell: a window plus the store and/or department it belongs to.
export const checklistInstanceScoreRunsQuerySchema = z.object({
    from: reportBoundary,
    to: reportBoundary,
    storeId: objectId.optional(),
    departmentId: objectId.optional(),
})

export const checklistInstanceByStoreReportQuerySchema = z.object({
    from: reportBoundary.optional(),
    to: reportBoundary.optional(),
})

// Same idea as checklistImages/checklistImage.validation.ts — the files themselves are validated
// by multer (config/upload.ts's checklistInstanceImageUpload), this just validates the one piece
// of metadata riding alongside them: how the photo was actually obtained.
export const uploadChecklistInstanceImageSchema = z.object({
    captureMethod: z.enum(CAPTURE_METHODS),
})

// Mirrors ticket.validation.ts's verifyTicketSchema — a note is required to reject, optional to
// approve.
export const verifyChecklistInstanceSchema = z.object({
    action: z.enum(["APPROVE", "REJECT"]),
    note: z.string().optional(),
}).refine(v => v.action === "APPROVE" || !!v.note?.trim(), {
    message: "A note is required when rejecting.",
    path: ["note"],
})

// Reviewer sends back only the listed questions (not the whole checklist), with what to fix.
export const sendBackChecklistInstanceSchema = z.object({
    itemIds: z.array(z.string().min(1)).min(1, "Pick at least one question.").max(200),
    note: z.string().trim().min(1, "Say what needs fixing.").max(1000),
})

// A reviewer excuses one question that would count against compliance: the reason is required and is shown
// to the person and written to the audit log.
export const raiseChecklistTicketSchema = z.object({
    note: z.string().trim().min(5, "Say what is wrong and what to fix.").max(2000),
    tatHours: z.number().positive().max(24 * 30),
    priority: z.enum(TICKET_PRIORITIES).optional(),
})

export const waiveChecklistItemSchema = z.object({
    reason: z.string().trim().min(5, "Say why this is being waived.").max(500),
})

export type SetChecklistInstanceItemDoneInput = z.infer<typeof setChecklistInstanceItemDoneSchema>
export type UploadChecklistInstanceImageInput = z.infer<typeof uploadChecklistInstanceImageSchema>
export type VerifyChecklistInstanceInput = z.infer<typeof verifyChecklistInstanceSchema>
export type RaiseChecklistTicketInput = z.infer<typeof raiseChecklistTicketSchema>
export type ChecklistInstanceComplianceReportQuery = z.infer<typeof checklistInstanceComplianceReportQuerySchema>

// Same page/limit convention as listDepartmentsQuerySchema — the list endpoints here were
// unbounded, hydrating every matching instance (items, images, submissions, accessories) on every
// call. `max(200)` mirrors the service-side cap so a caller can't reintroduce that by hand.
//
// `status` here is the completion-lifecycle filter (getMine/list — OPEN/DUE/COMPLETED/OVERDUE,
// matching checklistInstance.service.ts's InstanceStatusFilter), NOT the review-stage one. Those
// two used to share this one `status` field under the review-stage's narrower PENDING/
// PENDING_APPROVAL enum, which meant getMine/list's own `status=OVERDUE` etc. (My Checklists'
// quick-filter tiles, the overdue interstitial's preview query) failed `.parse()` outright — a 400
// on every request that passed a real completion-status filter, even though those two endpoints
// never even read `status` from this schema's parsed result (see the controller, which casts
// `req.query.status` directly) — `.parse()` still validates it since it's a query key with a
// stricter shape than what was actually being sent. See listPendingVerificationQuerySchema below
// for the review-stage sibling.
export const listChecklistInstancesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    // ISO instant or plain YYYY-MM-DD, read as org-local days by the service (asOrgDay).
    from: optionalBoundary,
    to: optionalBoundary,
    status: z.enum(["OPEN", "DUE", "COMPLETED", "OVERDUE"]).optional(),
    // Checked here instead of cast from req.query: ?storeId=a&storeId=b arrives as an array and would
    // reach the database as one.
    definitionId: objectId.optional(),
    storeId: objectId.optional(),
    assigneeId: objectId.optional(),
    personId: objectId.optional(),
})

// GET /checklist-instances/summary: only from/to need checking, the rest is scoped in the controller.
export const summaryQuerySchema = z.object({
    from: optionalBoundary,
    to: optionalBoundary,
})

// GET /checklist-instances/pending-verification's own query shape. Used to also take `status`,
// picking between two review-stage queues (PENDING for QC, PENDING_APPROVAL for a separate
// org-wide-only final approval) — collapsed to the one PENDING_APPROVAL queue.
export const listPendingVerificationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})

// GET /checklist-instances/decisions: from/to are an ISO datetime or an org-local YYYY-MM-DD (the whole
// day is included for `to`). Without them the window is today, org-local.
export const decisionsQuerySchema = z.object({
    from: reportBoundary.optional(),
    to: reportBoundary.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})

// Fill report over any window of up to a year: org-local days, both ends included.
const reportDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-28").refine((d) => !Number.isNaN(Date.parse(d + "T00:00:00Z")), "That is not a real date")
export const periodReportQuerySchema = z.object({
    from: reportDay,
    to: reportDay,
    storeId: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
}).refine((q) => q.from <= q.to, "From must be on or before To")
  .refine((q) => Date.parse(q.to + "T00:00:00Z") - Date.parse(q.from + "T00:00:00Z") <= 366 * 86_400_000, "Pick at most one year")

