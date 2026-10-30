import { TICKET_PRIORITIES } from "../../db/schema/ticket.js"
import { z } from "zod"
import { CAPTURE_METHODS } from "../../db/schema/task.js"
import { objectId } from "../../utils/index.js"

export const setChecklistInstanceItemDoneSchema = z.object({
    isDone: z.boolean(),
    numericValue: z.number().optional(),
    booleanAnswer: z.enum(["YES", "NO"]).optional(),
    textValue: z.string().optional(),
    dateValue: z.string().optional(),
    gpsLat: z.number().min(-90).max(90).optional(),
    gpsLng: z.number().min(-180).max(180).optional(),
    gpsAccuracy: z.number().min(0).optional(),
    signatureValue: z.string().optional(),
    secondSignatureValue: z.string().optional(),
    conditionalReasonValue: z.string().optional(),
    remarks: z.string().trim().max(1000).nullable().optional(),
    notApplicable: z.boolean().optional(),
})

const reportBoundary = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date or datetime")])

const optionalBoundary = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), reportBoundary.optional())

export const checklistInstanceComplianceReportQuerySchema = z.object({
    groupBy: z.enum(["day", "week", "month", "year", "none"]).default("day"),
    storeId: objectId.optional(),
    assigneeId: objectId.optional(),
    from: reportBoundary.optional(),
    to: reportBoundary.optional(),
})

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

export const uploadChecklistInstanceImageSchema = z.object({
    captureMethod: z.enum(CAPTURE_METHODS),
    purpose: z.enum(["GENERAL", "CONDITIONAL_YES", "CONDITIONAL_NO"]).default("GENERAL"),
    takenAt: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
})

export const verifyChecklistInstanceSchema = z.object({
    action: z.enum(["APPROVE", "REJECT"]),
    note: z.string().optional(),
    fixByHours: z.number().int().min(1).max(72).optional(),
}).refine(v => v.action === "APPROVE" || !!v.note?.trim(), {
    message: "A note is required when rejecting.",
    path: ["note"],
})

export const sendBackChecklistInstanceSchema = z.object({
    itemIds: z.array(z.string().min(1)).min(1, "Pick at least one question.").max(200),
    note: z.string().trim().min(1, "Say what needs fixing.").max(1000),
    fixByHours: z.number().int().min(1).max(72).optional(),
})

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

export const listChecklistInstancesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    from: optionalBoundary,
    to: optionalBoundary,
    status: z.enum(["OPEN", "DUE", "COMPLETED", "OVERDUE"]).optional(),
    definitionId: objectId.optional(),
    storeId: objectId.optional(),
    assigneeId: objectId.optional(),
    personId: objectId.optional(),
})

export const summaryQuerySchema = z.object({
    from: optionalBoundary,
    to: optionalBoundary,
})

export const listPendingVerificationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const decisionsQuerySchema = z.object({
    from: reportBoundary.optional(),
    to: reportBoundary.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})

const reportDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-28").refine((d) => !Number.isNaN(Date.parse(d + "T00:00:00Z")), "That is not a real date")
export const periodReportQuerySchema = z.object({
    from: reportDay,
    to: reportDay,
    storeId: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
}).refine((q) => q.from <= q.to, "From must be on or before To")
  .refine((q) => Date.parse(q.to + "T00:00:00Z") - Date.parse(q.from + "T00:00:00Z") <= 366 * 86_400_000, "Pick at most one year")

