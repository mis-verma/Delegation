import { clockParts } from "../../utils/clock.js"
export type LateWindowInput = {
    recurrence: string
    opensTime?: string | null
    cutoffTime?: string | null
    lateUntilTime?: string | null
}

export const END_OF_DAY_CUTOFF = "00:00"

export const isOvernightWindow = (opensTime: string | null | undefined, cutoffTime: string | null | undefined): boolean =>
    !!opensTime && !!cutoffTime && cutoffTime !== END_OF_DAY_CUTOFF && cutoffTime < opensTime

export const isTimedRecurrence = (recurrence: string): boolean => recurrence === "DAILY" || recurrence === "ONE_TIME"

export const windowTimesFor = (recurrence: string, input: { opensTime?: string | null; cutoffTime?: string | null; lateUntilTime?: string | null }) =>
    isTimedRecurrence(recurrence)
        ? { opensTime: input.opensTime ?? null, cutoffTime: input.cutoffTime ?? null, lateUntilTime: input.lateUntilTime ?? null }
        : { opensTime: null, cutoffTime: null, lateUntilTime: null }

export const sameOpenAndCloseProblem = (input: { opensTime?: string | null; cutoffTime?: string | null }): string | null =>
    input.opensTime && input.cutoffTime && input.opensTime === input.cutoffTime ? "Opening and closing can't be the same time." : null

const localDateKey = (date: Date, offsetMinutes: number): string => new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10)

export const isBeforeToday = (date: Date, now: Date, offsetMinutes: number): boolean =>
    localDateKey(date, offsetMinutes) < localDateKey(now, offsetMinutes)

export const sameLocalDate = (a: Date, b: Date, offsetMinutes: number): boolean =>
    localDateKey(a, offsetMinutes) === localDateKey(b, offsetMinutes)

export const lateWindowProblem = (input: LateWindowInput): string | null => {
    if (!input.lateUntilTime) return null
    if (input.recurrence !== "DAILY" && input.recurrence !== "ONE_TIME") return "A late window only works on daily or one-time checklists."
    if (!input.cutoffTime) return "Set a closing time before adding a late window."
    if (input.cutoffTime === END_OF_DAY_CUTOFF) return "A late window can't be used when the checklist closes at the end of the day."
    if (isOvernightWindow(input.opensTime, input.cutoffTime)) return "A late window can't be used when the checklist closes after midnight."
    if (input.lateUntilTime <= input.cutoffTime) return "The late window must end after the closing time."
    return null
}

export const formatClock = (time: string): string => {
    const [hours, minutes] = clockParts(time)
    const hour12 = hours % 12 === 0 ? 12 : hours % 12
    return `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`
}
