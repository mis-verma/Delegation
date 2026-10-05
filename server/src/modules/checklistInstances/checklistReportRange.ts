import { sql, type SQL } from "drizzle-orm"
import { env } from "../../config/env.js"

// Date-range and bucket helpers for the analytics report endpoints, shared by the checklist, ticket
// and task reports. Two families live here:
//  - resolveReportWindow / bucketSeries / zeroFill: org-local DAY windows ('YYYY-MM-DD'), used by the
//    checklist reports (periodStart is already an org-local day).
//  - resolveReportRange / bucketSql / utcSql: UTC INSTANT windows plus the SQL that buckets a
//    DATETIME column in the org's local calendar, used by the ticket and task reports.
// Both produce the same bucket labels (REPORT_DATE_FORMATS), so a series lines up whichever is used.
//
// ChecklistInstance.periodStart is the org-LOCAL calendar day written as UTC midnight (see
// utils/period.ts). So every range here is a pair of org-local 'YYYY-MM-DD' strings, and an ISO
// instant sent by a client in another time zone is first converted to the org-local date it falls
// on. Comparing the raw instant against periodStart would drop the first day for an admin whose
// browser sits behind the org's offset.

export type ReportGroupBy = "day" | "week" | "month" | "year" | "none"

export const REPORT_GROUP_BYS = ["day", "week", "month", "year", "none"] as const

// MySQL DATE_FORMAT strings. Must produce exactly what bucketKey() below produces, so a bucket
// the database returned lines up with a bucket generated for zero-filling.
export const REPORT_DATE_FORMATS: Record<Exclude<ReportGroupBy, "none">, string> = {
    day: "%Y-%m-%d",
    week: "%x-W%v",
    month: "%Y-%m",
    year: "%Y",
}

/** Name of the single bucket groupBy=none returns. */
export const RANGE_BUCKET = "range"

/** A zero-filled series longer than this is not generated (the caller gets only the buckets with data). */
const MAX_FILLED_BUCKETS = 1000
/** Days walked when generating a series, a hard stop against absurd ranges. */
const MAX_WALK_DAYS = 20_000

const DAY_MS = 86_400_000
const pad2 = (n: number) => String(n).padStart(2, "0")

const toDateString = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const parseDateString = (date: string) => Date.parse(`${date}T00:00:00.000Z`)

/** The org-local calendar day an instant falls on, as 'YYYY-MM-DD'. */
export const orgLocalDate = (instant: Date | number): string => {
    const ms = typeof instant === "number" ? instant : instant.getTime()
    return toDateString(ms + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
}

/** 'YYYY-MM-DD' plus a number of days. */
export const addDays = (date: string, days: number): string => toDateString(parseDateString(date) + days * DAY_MS)

/** Monday of the ISO week containing the date. */
const mondayOf = (date: string): string => {
    const dayNum = (new Date(parseDateString(date)).getUTCDay() + 6) % 7 // Monday = 0
    return addDays(date, -dayNum)
}

/** ISO year and week number, matching MySQL's %x and %v. */
const isoWeekParts = (date: string): { year: number; week: number } => {
    // The week belongs to the year of its Thursday.
    const thursday = parseDateString(addDays(mondayOf(date), 3))
    const year = new Date(thursday).getUTCFullYear()
    const ordinal = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS) + 1
    return { year, week: Math.floor((ordinal - 1) / 7) + 1 }
}

/** The bucket label a given org-local day falls in. Same text as REPORT_DATE_FORMATS gives. */
export const bucketKey = (date: string, groupBy: ReportGroupBy): string => {
    switch (groupBy) {
        case "day": return date
        case "week": {
            const { year, week } = isoWeekParts(date)
            return `${year}-W${pad2(week)}`
        }
        case "month": return date.slice(0, 7)
        case "year": return date.slice(0, 4)
        default: return RANGE_BUCKET
    }
}

export type ReportWindow = {
    /** First org-local day included, 'YYYY-MM-DD'. */
    fromDate: string
    /** Last org-local day included, 'YYYY-MM-DD'. */
    toDate: string
    /** Day after toDate: use it as an exclusive upper bound (`periodStart < toExclusive`). */
    toExclusive: string
}

/**
 * Turns the request's from/to into an org-local day window.
 *
 * A from/to may be an ISO datetime (converted to the org-local day it falls on) or a plain
 * 'YYYY-MM-DD' (taken as the org-local day as is). With neither, the window is never unbounded:
 * the last 12 buckets for week/month/year, the last 30 days for day and none. With only one end
 * given, the other end is `today` (for a missing to) or the default span back from `to`.
 */
/**
 * A request boundary as an org-local 'YYYY-MM-DD': a plain day is taken as is, an ISO instant is
 * converted to the org-local day it falls on. Shared by the report window and the instance
 * list/summary filters so every endpoint reads from/to the same way. Throws a RangeError on text
 * that is neither (the validation layer rejects that with a 400 before it gets here).
 */
export const asOrgDay = (value: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : orgLocalDate(new Date(value)))

export const resolveReportWindow = (groupBy: ReportGroupBy, from?: string, to?: string, now: number = Date.now()): ReportWindow => {
    const asDay = asOrgDay
    const toDate = to ? asDay(to) : orgLocalDate(now)
    let fromDate: string
    if (from) {
        fromDate = asDay(from)
    } else {
        switch (groupBy) {
            case "week":
                fromDate = addDays(mondayOf(toDate), -11 * 7)
                break
            case "month": {
                const d = new Date(parseDateString(toDate))
                fromDate = toDateString(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1))
                break
            }
            case "year":
                fromDate = `${Number(toDate.slice(0, 4)) - 11}-01-01`
                break
            default:
                fromDate = addDays(toDate, -29)
        }
    }
    return { fromDate, toDate, toExclusive: addDays(toDate, 1) }
}

/** Every bucket label from fromDate to toDate, in order, with no gaps. Empty when the range is too large to fill. */
export const bucketSeries = (groupBy: ReportGroupBy, fromDate: string, toDate: string): string[] => {
    if (groupBy === "none") return [RANGE_BUCKET]
    const start = parseDateString(fromDate)
    const end = parseDateString(toDate)
    if (!(end >= start)) return []
    const keys: string[] = []
    let last = ""
    for (let ms = start, walked = 0; ms <= end && walked < MAX_WALK_DAYS; ms += DAY_MS, walked++) {
        const key = bucketKey(toDateString(ms), groupBy)
        if (key !== last) {
            keys.push(key)
            last = key
            if (keys.length > MAX_FILLED_BUCKETS) return []
        }
    }
    return keys
}

/**
 * Lays rows over a contiguous bucket series: a bucket with no data becomes `makeEmpty(bucket)`.
 * If the series is too large to generate, the rows are returned as they are.
 */
export const zeroFill = <T extends { bucket: string }>(rows: T[], groupBy: ReportGroupBy, window: ReportWindow, makeEmpty: (bucket: string) => T): T[] => {
    const series = bucketSeries(groupBy, window.fromDate, window.toDate)
    if (!series.length) return rows
    const byBucket = new Map(rows.map((r) => [r.bucket, r]))
    return series.map((bucket) => byBucket.get(bucket) ?? makeEmpty(bucket))
}

// ---------------------------------------------------------------------------------------------
// Instant-based range (ticket and task reports). Moved here unchanged from ticket.service.ts.
// ---------------------------------------------------------------------------------------------

const MS_MINUTE = 60_000
// Hard ceiling on a returned series so a huge explicit range at day granularity can't produce an
// unbounded response; the oldest buckets are dropped first.
const MAX_REPORT_BUCKETS = 800

// Org-local offset ahead of UTC, in whole minutes (same env var the checklist engine uses).
const orgOffsetMinutes = (): number => {
    const offset = Math.trunc(Number(env.CHECKLIST_TIMEZONE_OFFSET_MINUTES))
    return Number.isFinite(offset) ? offset : 0
}

type BucketUnit = Exclude<ReportGroupBy, "none">

// "Local-as-UTC" helpers: shifting an instant by the org offset and then reading it with the UTC
// getters yields the org's wall-clock fields.
const bucketStartLocal = (localMs: number, groupBy: BucketUnit): number => {
    const d = new Date(localMs)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const day = d.getUTCDate()
    if (groupBy === "year") return Date.UTC(y, 0, 1)
    if (groupBy === "month") return Date.UTC(y, m, 1)
    if (groupBy === "week") {
        const sinceMonday = (d.getUTCDay() + 6) % 7
        return Date.UTC(y, m, day - sinceMonday)
    }
    return Date.UTC(y, m, day)
}

const nextBucketLocal = (startLocal: number, groupBy: BucketUnit): number => {
    const d = new Date(startLocal)
    if (groupBy === "year") return Date.UTC(d.getUTCFullYear() + 1, 0, 1)
    if (groupBy === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    if (groupBy === "week") return startLocal + 7 * DAY_MS
    return startLocal + DAY_MS
}

const prevBucketLocal = (startLocal: number, groupBy: BucketUnit): number => {
    const d = new Date(startLocal)
    if (groupBy === "year") return Date.UTC(d.getUTCFullYear() - 1, 0, 1)
    if (groupBy === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)
    if (groupBy === "week") return startLocal - 7 * DAY_MS
    return startLocal - DAY_MS
}

// Same string MySQL's DATE_FORMAT produces for REPORT_DATE_FORMATS[groupBy] ('%x-W%v' is the ISO
// week: the year/week of the bucket's Thursday).
const bucketKeyLocal = (startLocal: number, groupBy: BucketUnit): string => {
    const d = new Date(startLocal)
    if (groupBy === "year") return String(d.getUTCFullYear())
    if (groupBy === "month") return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
    if (groupBy === "week") {
        const thursday = new Date(startLocal + 3 * DAY_MS)
        const isoYear = thursday.getUTCFullYear()
        const dayOfYear = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / DAY_MS)
        return `${isoYear}-W${pad2(Math.floor(dayOfYear / 7) + 1)}`
    }
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export type ReportRange = { from: Date; to: Date; buckets: string[] }

// Resolves the window a bucketed report covers and the contiguous list of bucket keys inside it.
// No from/to -> the last 12 buckets (last 30 days for day, and for 'none'), never unbounded.
// 'none' collapses the whole window into one bucket named 'range'.
export const resolveReportRange = (groupBy: ReportGroupBy, from?: string, to?: string, now: Date = new Date()): ReportRange => {
    const offsetMs = orgOffsetMinutes() * MS_MINUTE
    const unit: BucketUnit = groupBy === "none" ? "day" : groupBy
    const defaultBuckets = groupBy === "day" || groupBy === "none" ? 30 : 12

    let toDate = to ? new Date(to) : now
    let fromDate: Date
    if (from) {
        fromDate = new Date(from)
    } else {
        let start = bucketStartLocal(toDate.getTime() + offsetMs, unit)
        for (let i = 1; i < defaultBuckets; i++) start = prevBucketLocal(start, unit)
        fromDate = new Date(start - offsetMs)
    }
    if (fromDate.getTime() > toDate.getTime()) toDate = fromDate

    if (groupBy === "none") return { from: fromDate, to: toDate, buckets: [RANGE_BUCKET] }

    const lastStart = bucketStartLocal(toDate.getTime() + offsetMs, unit)
    let cursor = bucketStartLocal(fromDate.getTime() + offsetMs, unit)
    const starts: number[] = []
    while (cursor <= lastStart) {
        starts.push(cursor)
        cursor = nextBucketLocal(cursor, unit)
    }
    if (starts.length > MAX_REPORT_BUCKETS) {
        starts.splice(0, starts.length - MAX_REPORT_BUCKETS)
        const firstInstant = new Date(starts[0]! - offsetMs)
        if (firstInstant.getTime() > fromDate.getTime()) fromDate = firstInstant
    }
    return { from: fromDate, to: toDate, buckets: starts.map((s) => bucketKeyLocal(s, unit)) }
}

// SQL for "which bucket does this datetime column fall in", in the org's local calendar. The offset
// is an integer from env (never user input), so it is safe to inline.
export const bucketSql = (groupBy: ReportGroupBy, column: SQL): SQL =>
    groupBy === "none"
        ? sql.raw(`'${RANGE_BUCKET}'`)
        : sql`DATE_FORMAT(DATE_ADD(${column}, INTERVAL ${sql.raw(String(orgOffsetMinutes()))} MINUTE), ${REPORT_DATE_FORMATS[groupBy]})`

// DATETIME columns hold UTC wall-clock strings (Drizzle writes them via toISOString). Passing a raw
// JS Date into a sql`` template instead makes mysql2 format it in Node's local timezone, so the
// bound could silently shift by the server's UTC offset. This formats the UTC string explicitly.
export const utcSql = (date: Date): SQL => sql`${date.toISOString().slice(0, 19).replace("T", " ")}`
