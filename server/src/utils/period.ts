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

const steppedMonthPeriod = (anchor: Date, today: Date, stepMonths: number): Period | null => {
    if (today < anchor) return null
    const monthsElapsed = monthsBetweenUTC(anchor, today)
    let periods = Math.floor(monthsElapsed / stepMonths)
    let periodStart = addMonthsClamped(anchor, periods * stepMonths)
    if (today < periodStart) {
        periods -= 1
        periodStart = addMonthsClamped(anchor, periods * stepMonths)
    }
    const periodEnd = addMonthsClamped(anchor, (periods + 1) * stepMonths)
    return { periodKey: formatDateKey(periodStart), periodStart, periodEnd }
}

const ONE_TIME_KEY = "ONE_TIME"

export const getCurrentPeriod = (recurrence: ChecklistRecurrence, startDate: Date, now: Date, offsetMinutes: number): Period | null => {
    const anchor = toDateOnlyUTC(startDate, offsetMinutes)
    const today = toDateOnlyUTC(now, offsetMinutes)

    switch (recurrence) {
        case "DAILY":
            return steppedDayPeriod(anchor, today, 1)
        case "WEEKLY":
            return steppedDayPeriod(anchor, today, 7)
        case "MONTHLY":
            return steppedMonthPeriod(anchor, today, 1)
        case "QUARTERLY":
            return steppedMonthPeriod(anchor, today, 3)
        case "YEARLY":
            return steppedMonthPeriod(anchor, today, 12)
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
    const today = toDateOnlyUTC(now, offsetMinutes)
    const current = getCurrentPeriod(recurrence, startDate, now, offsetMinutes)
    const nextStart = current ? current.periodEnd : toDateOnlyUTC(startDate, offsetMinutes)
    if (daysBetweenUTC(today, nextStart) > leadDays) return null
    const next = getCurrentPeriod(recurrence, startDate, nextStart, offsetMinutes)
    return next && next.periodKey !== current?.periodKey ? next : null
}
