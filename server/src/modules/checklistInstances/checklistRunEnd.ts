import { AppError } from "../../utils/AppError.js"
import { isAdminOrPc } from "../../utils/roles.js"
import { clockParts } from "../../utils/clock.js"



export type RunEndInput = {
    recurrence: string
    verificationStatus: string
    periodStart: Date
    periodEnd: Date
    cutoffTime: string | null
    opensTime: string | null
    lateUntilTime?: string | null
}

const MINUTE_MS = 60_000

export const runDeadlineMs = (run: Pick<RunEndInput, "periodStart" | "periodEnd" | "cutoffTime" | "opensTime">, offsetMinutes: number): number => {
    const offsetMs = offsetMinutes * MINUTE_MS
    if (!run.cutoffTime) return run.periodEnd.getTime() - offsetMs
    const [hours, minutes] = clockParts(run.cutoffTime)
    const dayRoll = run.opensTime && run.cutoffTime < run.opensTime ? 24 * 60 : 0
    return run.periodStart.getTime() + (hours * 60 + minutes + dayRoll) * MINUTE_MS - offsetMs
}

const toMs = (now: Date | number) => (typeof now === "number" ? now : now.getTime())

export const runClosingMs = (run: Pick<RunEndInput, "periodStart" | "periodEnd" | "cutoffTime" | "opensTime" | "lateUntilTime">, offsetMinutes: number): number => {
    const deadline = runDeadlineMs(run, offsetMinutes)
    if (!run.lateUntilTime || !run.cutoffTime) return deadline
    const [cutoffHours, cutoffMinutes] = clockParts(run.cutoffTime)
    const [lateHours, lateMinutes] = clockParts(run.lateUntilTime)
    const extraMinutes = lateHours * 60 + lateMinutes - (cutoffHours * 60 + cutoffMinutes)
    return extraMinutes > 0 ? deadline + extraMinutes * MINUTE_MS : deadline
}

export const hasRunClosingPassed = (run: Parameters<typeof runClosingMs>[0], now: Date | number, offsetMinutes: number): boolean =>
    runClosingMs(run, offsetMinutes) <= toMs(now)

export type RunPhase = "open" | "late" | "closed"

export const runPhase = (
    run: RunEndInput & { totalItems: number; doneItems: number },
    now: Date | number,
    offsetMinutes: number,
): RunPhase => {
    if (!isRunEnded(run, now, offsetMinutes)) {
        const complete = run.totalItems > 0 && run.doneItems === run.totalItems
        const pastDeadline = hasRunDeadlinePassed(run, now, offsetMinutes)
        return pastDeadline && !complete && run.recurrence !== "ONE_TIME" && !!run.lateUntilTime ? "late" : "open"
    }
    return "closed"
}


export const hasRunDeadlinePassed = (run: Parameters<typeof runDeadlineMs>[0], now: Date | number, offsetMinutes: number): boolean =>
    runDeadlineMs(run, offsetMinutes) <= toMs(now)


export const isRunEnded = (
    run: RunEndInput & { totalItems: number; doneItems: number },
    now: Date | number,
    offsetMinutes: number,
): boolean => {
    if (run.recurrence === "ONE_TIME") return false
    if (run.verificationStatus === "REJECTED") return false
    if (run.totalItems > 0 && run.doneItems === run.totalItems) return false
    return hasRunClosingPassed(run, now, offsetMinutes)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const describeRunEnd = (deadlineMs: number, offsetMinutes: number): string => {
    const local = new Date(deadlineMs + offsetMinutes * MINUTE_MS)
    const h = local.getUTCHours()
    const m = local.getUTCMinutes()
    if (h === 0 && m === 0) {
        const lastDay = new Date(local.getTime() - 24 * 60 * MINUTE_MS)
        return `the end of ${lastDay.getUTCDate()} ${MONTHS[lastDay.getUTCMonth()]}`
    }
    const hour12 = h % 12 === 0 ? 12 : h % 12
    return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} on ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}`
}

export const runClosedMessage = (deadlineMs: number, offsetMinutes: number): string =>
    `This checklist closed at ${describeRunEnd(deadlineMs, offsetMinutes)}. It can't be filled in any more. Today's checklist is in My Checklists.`

export const canWorkEndedRun = (user: { role: string }): boolean => isAdminOrPc(user.role)

export const assertRunOpen = (
    run: RunEndInput & { totalItems: number; doneItems: number },
    user: { role: string },
    now: Date | number,
    offsetMinutes: number,
): void => {
    if (canWorkEndedRun(user)) return
    if (!isRunEnded(run, now, offsetMinutes)) return
    throw AppError.badRequest(runClosedMessage(runClosingMs(run, offsetMinutes), offsetMinutes))
}
