import { z } from "zod"
import { env } from "../../config/env.js"

export const MAX_RANGE_DAYS = 366
const DAY_MS = 86_400_000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// "YYYY-MM-DD" is taken as the org-local day it already is. A full ISO timestamp is a real instant,
// so it is shifted by the org offset to find the org-local day it falls on (periodStart is stored
// as that org-local day written as UTC midnight, see utils/period.ts).
const toLocalDay = (value: string): string | null => {
    if (DATE_ONLY.test(value)) {
        return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? null : value
    }
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) return null
    return new Date(ms + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

// Empty strings from a cleared filter on the client mean "no filter".
const optionalId = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().min(1).max(191).optional())
const optionalDate = z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().refine((v) => toLocalDay(v) !== null, "Use a date like 2026-09-01").optional(),
)

export const CHECKLIST_REPORT_GROUPINGS = ["person", "department", "both"] as const
export type ChecklistReportGrouping = (typeof CHECKLIST_REPORT_GROUPINGS)[number]

const baseSchema = z.object({
    from: optionalDate,
    to: optionalDate,
    storeId: optionalId,
    departmentId: optionalId,
    groupBy: z.enum(CHECKLIST_REPORT_GROUPINGS).default("both"),
})

// Resolves the defaults (last 30 days ending today, org-local) and enforces the range rules, so the
// service always receives two valid YYYY-MM-DD strings with from <= to and at most 366 days apart.
const resolveRange = <T extends z.infer<typeof baseSchema>>(q: T, ctx: z.RefinementCtx) => {
    const today = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
    const to = q.to ? toLocalDay(q.to)! : today
    const from = q.from
        ? toLocalDay(q.from)!
        : new Date(Date.parse(`${to}T00:00:00.000Z`) - 29 * DAY_MS).toISOString().slice(0, 10)
    const days = Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1
    if (days < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "The start date must be on or before the end date" })
        return z.NEVER
    }
    if (days > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: `Pick a period of ${MAX_RANGE_DAYS} days or less` })
        return z.NEVER
    }
    return { ...q, from, to }
}

export const checklistReportQuerySchema = baseSchema.transform(resolveRange)

export const checklistReportExportQuerySchema = baseSchema
    .extend({ format: z.enum(["xlsx", "csv"]).default("xlsx") })
    .transform(resolveRange)

export type ChecklistReportQuery = z.output<typeof checklistReportQuerySchema>
export type ChecklistReportExportQuery = z.output<typeof checklistReportExportQuerySchema>
