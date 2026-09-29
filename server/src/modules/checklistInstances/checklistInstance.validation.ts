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
export const checklistInstanceComplianceReportQuerySchema = z.object({
    groupBy: z.enum(["hour", "day", "week", "month", "year"]).default("day"),
    storeId: objectId.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
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

export type SetChecklistInstanceItemDoneInput = z.infer<typeof setChecklistInstanceItemDoneSchema>
export type UploadChecklistInstanceImageInput = z.infer<typeof uploadChecklistInstanceImageSchema>
export type VerifyChecklistInstanceInput = z.infer<typeof verifyChecklistInstanceSchema>
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
    from: z.string().optional(),
    to: z.string().optional(),
    status: z.enum(["OPEN", "DUE", "COMPLETED", "OVERDUE"]).optional(),
})

// GET /checklist-instances/pending-verification's own query shape. Used to also take `status`,
// picking between two review-stage queues (PENDING for QC, PENDING_APPROVAL for a separate
// org-wide-only final approval) — collapsed to the one PENDING_APPROVAL queue.
export const listPendingVerificationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})
