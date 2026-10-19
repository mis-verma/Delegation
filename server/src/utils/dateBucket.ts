export type DateBucket = "hour" | "day" | "week" | "month" | "year"

export const DATE_FORMATS: Record<DateBucket, string> = {
    hour: '%Y-%m-%dT%H:00',
    day: '%Y-%m-%d',
    week: '%x-W%v',
    month: '%Y-%m',
    year: '%Y',
}
