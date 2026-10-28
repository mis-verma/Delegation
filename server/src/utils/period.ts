import type { ChecklistRecurrence } from "../db/schema/checklistDefinition.js"

export type Period = { periodKey: string; periodStart: Date; periodEnd: Date }

const MS_PER_DAY = 24 * 60 * 60 * 1000

const toDateOnlyUTC = (date: Date, offsetMinutes: number): Date => {
    const shifted = new Date(date.getTime() + offsetMinutes * 60_000)
    return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}

const addDaysUTC = (date: Date, days: number): Date => {
    const result = new Date(date)
    result.setUTCDate(result.getUTCDate() + days)
    return result
}

const addMonthsClamped = (date: Date, months: number): Date => {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + months
    const day = date.getUTCDate()
    const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)))
}

const daysBetweenUTC = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY)

const monthsBetweenUTC = (from: Date, to: Date): number =>
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())

const formatDateKey = (date: Date): string => date.toISOString().slice(0, 10)

const steppedDayPeriod = (anchor: Date, today: Date, stepDays: number): Period | null => {
    if (today < anchor) return null
    const elapsedDays = daysBetweenUTC(anchor, today)
    const periods = Math.floor(elapsedDays / stepDays)
    const periodStart = addDaysUTC(anchor, periods * stepDays)
    return { periodKey: formatDateKey(periodStart), periodStart, periodEnd: addDaysUTC(periodStart, stepDays) }
}

const dayPeriod = (day: Date): Period => ({ periodKey: formatDateKey(day), periodStart: day, periodEnd: addDaysUTC(day, 1) })

const MONTH_STEP: Partial<Record<ChecklistRecurrence, number>> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }

const occurrenceOn = (recurrence: ChecklistRecurrence, anchor: Date, day: Date): Period | null => {
    if (day < anchor) return null
    if (recurrence === "WEEKLY") return daysBetweenUTC(anchor, day) % 7 === 0 ? dayPeriod(day) : null
    const step = MONTH_STEP[recurrence]
    if (!step) return null
    const months = monthsBetweenUTC(anchor, day)
    if (months % step !== 0) return null
    return addMonthsClamped(anchor, months).getTime() === day.getTime() ? dayPeriod(day) : null
}

const ONE_TIME_KEY = "ONE_TIME"

export const getCurrentPeriod = (recurrence: ChecklistRecurrence, startDate: Date, now: Date, offsetMinutes: number): Period | null => {
    const anchor = toDateOnlyUTC(startDate, offsetMinutes)
    const today = toDateOnlyUTC(now, offsetMinutes)

    switch (recurrence) {
        case "DAILY":
            return steppedDayPeriod(anchor, today, 1)
        case "WEEKLY":
        case "MONTHLY":
        case "QUARTERLY":
        case "YEARLY":
            return occurrenceOn(recurrence, anchor, today)
        case "ONE_TIME":
            if (today < anchor) return null
            return { periodKey: ONE_TIME_KEY, periodStart: anchor, periodEnd: addDaysUTC(anchor, 1) }
    }
}

export const UPCOMING_LEAD_DAYS = 3

export const getUpcomingPeriod = (
    recurrence: ChecklistRecurrence,
    startDate: Date,
    now: Date,
    offsetMinutes: number,
    leadDays: number = UPCOMING_LEAD_DAYS,
): Period | null => {
    if (recurrence === "DAILY" || recurrence === "ONE_TIME") return null
    const anchor = toDateOnlyUTC(startDate, offsetMinutes)
    const today = toDateOnlyUTC(now, offsetMinutes)
    for (let ahead = 1; ahead <= leadDays; ahead++) {
        const found = occurrenceOn(recurrence, anchor, addDaysUTC(today, ahead))
        if (found) return found
    }
    return null
}
