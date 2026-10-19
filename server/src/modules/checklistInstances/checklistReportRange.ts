import { sql, type SQL } from "drizzle-orm"
import { env } from "../../config/env.js"

export type ReportGroupBy = "day" | "week" | "month" | "year" | "none"

export const REPORT_GROUP_BYS = ["day", "week", "month", "year", "none"] as const

export const REPORT_DATE_FORMATS: Record<Exclude<ReportGroupBy, "none">, string> = {
    day: "%Y-%m-%d",
    week: "%x-W%v",
    month: "%Y-%m",
    year: "%Y",
}

export const RANGE_BUCKET = "range"

const MAX_FILLED_BUCKETS = 1000
const MAX_WALK_DAYS = 20_000

const DAY_MS = 86_400_000
const pad2 = (n: number) => String(n).padStart(2, "0")

const toDateString = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const parseDateString = (date: string) => Date.parse(`${date}T00:00:00.000Z`)

export const orgLocalDate = (instant: Date | number): string => {
    const ms = typeof instant === "number" ? instant : instant.getTime()
    return toDateString(ms + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
}

export const addDays = (date: string, days: number): string => toDateString(parseDateString(date) + days * DAY_MS)

const mondayOf = (date: string): string => {
    const dayNum = (new Date(parseDateString(date)).getUTCDay() + 6) % 7
    return addDays(date, -dayNum)
}

const isoWeekParts = (date: string): { year: number; week: number } => {
    const thursday = parseDateString(addDays(mondayOf(date), 3))
    const year = new Date(thursday).getUTCFullYear()
    const ordinal = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS) + 1
    return { year, week: Math.floor((ordinal - 1) / 7) + 1 }
}

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
    fromDate: string
    toDate: string
    toExclusive: string
}

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

export const zeroFill = <T extends { bucket: string }>(rows: T[], groupBy: ReportGroupBy, window: ReportWindow, makeEmpty: (bucket: string) => T): T[] => {
    const series = bucketSeries(groupBy, window.fromDate, window.toDate)
    if (!series.length) return rows
    const byBucket = new Map(rows.map((r) => [r.bucket, r]))
    return series.map((bucket) => byBucket.get(bucket) ?? makeEmpty(bucket))
}

const MS_MINUTE = 60_000
const MAX_REPORT_BUCKETS = 800

const orgOffsetMinutes = (): number => {
    const offset = Math.trunc(Number(env.CHECKLIST_TIMEZONE_OFFSET_MINUTES))
    return Number.isFinite(offset) ? offset : 0
}

type BucketUnit = Exclude<ReportGroupBy, "none">

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

export const bucketSql = (groupBy: ReportGroupBy, column: SQL): SQL =>
    groupBy === "none"
        ? sql.raw(`'${RANGE_BUCKET}'`)
        : sql`DATE_FORMAT(DATE_ADD(${column}, INTERVAL ${sql.raw(String(orgOffsetMinutes()))} MINUTE), ${REPORT_DATE_FORMATS[groupBy]})`

export const utcSql = (date: Date): SQL => sql`${date.toISOString().slice(0, 19).replace("T", " ")}`
