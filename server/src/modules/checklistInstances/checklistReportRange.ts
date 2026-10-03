import { env } from "../../config/env.js"

// Date-range and bucket helpers for the analytics report endpoints. Pure functions, no DB access,
// so any report (checklist, ticket, task) can share them.
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
export const resolveReportWindow = (groupBy: ReportGroupBy, from?: string, to?: string, now: number = Date.now()): ReportWindow => {
    const asDay = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : orgLocalDate(new Date(value)))
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
