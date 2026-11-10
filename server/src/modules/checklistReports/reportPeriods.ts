export const PERIOD_BUCKETS = ["week", "month"] as const
export type PeriodBucketKind = (typeof PERIOD_BUCKETS)[number]

export const MAX_BUCKETS: Record<PeriodBucketKind, number> = { week: 26, month: 12 }

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

export const buildBuckets = (kind: PeriodBucketKind, from: string, to: string): PeriodBucket[] => {
    const buckets: PeriodBucket[] = []
    if (from > to) return buckets
    let start = kind === "week" ? mondayOf(from) : monthStartOf(from)
    while (start <= to) {
        const end = kind === "week" ? addDays(start, 6) : monthEndOf(start)
        buckets.push({
            key: start,
            label: kind === "week" ? weekLabel(start, end) : `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`,
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
    return { from: dayOf(Date.UTC(year, month - 3, 1)), to: today }
}

export const percentOf = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
