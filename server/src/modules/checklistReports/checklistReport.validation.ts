import { z } from "zod"
import { env } from "../../config/env.js"
import { BUCKET_NOUN, MAX_BUCKETS, PERIOD_BUCKETS, buildBuckets, defaultPeriodRange } from "./reportPeriods.js"

export const MAX_RANGE_DAYS = 366
const DAY_MS = 86_400_000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const toLocalDay = (value: string): string | null => {
    if (DATE_ONLY.test(value)) {
        return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? null : value
    }
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) return null
    return new Date(ms + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

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

export const PERIOD_ROW_KINDS = ["person", "checklist"] as const

export const checklistPeriodQuerySchema = z.object({
    by: z.enum(PERIOD_ROW_KINDS).default("person"),
    bucket: z.enum(PERIOD_BUCKETS).default("week"),
    from: optionalDate,
    to: optionalDate,
    storeId: optionalId,
    departmentId: optionalId,
}).transform((q, ctx) => {
    const today = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
    const fallback = defaultPeriodRange(q.bucket, today)
    const to = q.to ? toLocalDay(q.to)! : fallback.to
    const from = q.from ? toLocalDay(q.from)! : q.to ? defaultPeriodRange(q.bucket, to).from : fallback.from
    if (from > to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "The start date must be on or before the end date" })
        return z.NEVER
    }
    const count = buildBuckets(q.bucket, from, to).length
    if (count > MAX_BUCKETS[q.bucket]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: `Pick ${MAX_BUCKETS[q.bucket]} ${BUCKET_NOUN[q.bucket].many} or fewer` })
        return z.NEVER
    }
    return { ...q, from, to }
})

export type ChecklistPeriodQuery = z.output<typeof checklistPeriodQuerySchema>
export type ChecklistReportExportQuery = z.output<typeof checklistReportExportQuerySchema>
