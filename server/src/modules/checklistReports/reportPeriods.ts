export const PERIOD_BUCKETS = ["week", "month", "quarter", "year"] as const
export type PeriodBucketKind = (typeof PERIOD_BUCKETS)[number]

export const MAX_BUCKETS: Record<PeriodBucketKind, number> = { week: 26, month: 12, quarter: 8, year: 5 }

export const BUCKET_NOUN: Record<PeriodBucketKind, { one: string; many: string }> = {
    week: { one: "week", many: "weeks" },
    month: { one: "month", many: "months" },
    quarter: { one: "quarter", many: "quarters" },
    year: { one: "year", many: "years" },
}

export type PeriodBucket = { key: string; label: string; from: string; to: string }

const DAY_MS = 86_400_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const dayMs = (day: string) => Date.parse(`${day}T00:00:00.000Z`)
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (day: string, n: number) => dayOf(dayMs(day) + n * DAY_MS)
const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

export const mondayOf = (day: string): string => {
    const weekday = (new Date(dayMs(day)).getUTCDay() + 6) % 7
    return addDays(day, -weekday)
}

export const monthStartOf = (day: string): string => `${day.slice(0, 8)}01`

const monthEndOf = (day: string): string => {
    const year = Number(day.slice(0, 4))
    const month = Number(day.slice(5, 7))
    return dayOf(Date.UTC(year, month, 0))
}

const weekLabel = (start: string, end: string) =>
    start.slice(5, 7) === end.slice(5, 7) ? `${Number(start.slice(8, 10))} to ${shortDay(end)}` : `${shortDay(start)} to ${shortDay(end)}`

export const quarterStartOf = (day: string): string => {
    const month = Number(day.slice(5, 7)) - 1
    return `${day.slice(0, 4)}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, "0")}-01`
}

export const yearStartOf = (day: string): string => `${day.slice(0, 4)}-01-01`

const quarterEndOf = (start: string): string => {
    const year = Number(start.slice(0, 4))
    const month = Number(start.slice(5, 7))
    return dayOf(Date.UTC(year, month + 2, 0))
}

const startOf = (kind: PeriodBucketKind, day: string) =>
    kind === "week" ? mondayOf(day) : kind === "month" ? monthStartOf(day) : kind === "quarter" ? quarterStartOf(day) : yearStartOf(day)

const endOf = (kind: PeriodBucketKind, start: string) =>
    kind === "week" ? addDays(start, 6) : kind === "month" ? monthEndOf(start) : kind === "quarter" ? quarterEndOf(start) : `${start.slice(0, 4)}-12-31`

const labelOf = (kind: PeriodBucketKind, start: string, end: string) => {
    if (kind === "week") return weekLabel(start, end)
    if (kind === "month") return `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`
    if (kind === "quarter") return `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`
    return start.slice(0, 4)
}

export const buildBuckets = (kind: PeriodBucketKind, from: string, to: string): PeriodBucket[] => {
    const buckets: PeriodBucket[] = []
    if (from > to) return buckets
    let start = startOf(kind, from)
    while (start <= to) {
        const end = endOf(kind, start)
        buckets.push({
            key: start,
            label: labelOf(kind, start, end),
            from: start < from ? from : start,
            to: end > to ? to : end,
        })
        start = addDays(end, 1)
    }
    return buckets
}

export const defaultPeriodRange = (kind: PeriodBucketKind, today: string): { from: string; to: string } => {
    if (kind === "week") return { from: addDays(mondayOf(today), -28), to: today }
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7)) - 1
    if (kind === "month") return { from: dayOf(Date.UTC(year, month - 3, 1)), to: today }
    if (kind === "quarter") return { from: dayOf(Date.UTC(year, Math.floor(month / 3) * 3 - 9, 1)), to: today }
    return { from: `${year - 2}-01-01`, to: today }
}

export const percentOf = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
