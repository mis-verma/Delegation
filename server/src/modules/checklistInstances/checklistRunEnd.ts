import { AppError } from "../../utils/AppError.js"

// The one definition of "when does a checklist run end", in plain TypeScript (no database, no env, so it
// can be unit tested). checklistMissedRun.ts holds the SQL twin of the same rules; keep the two in step.
//
// A run ends at its deadline:
//  - with a cutoff time (HH:mm, org-local): that time on the day the period starts, or on the NEXT day
//    when the window is overnight (cutoff earlier than the opens time),
//  - with no cutoff: the end of the period. periodEnd is EXCLUSIVE (a daily run's periodEnd is the next
//    day's midnight), so the run ends the moment the period's last day does.
// periodStart / periodEnd are org-local calendar days written as UTC midnight, so "day + clock time" minus
// the org's UTC offset is the real instant.
//
// After the deadline the people a run is assigned to can no longer see it in their own lists or fill it
// (ADMIN and PC still can). Left workable on purpose, even after the end:
//  - a run sent back for fixing (verificationStatus REJECTED): the person has to correct it,
//  - a run that is fully done (it only waits to be submitted or approved),
//  - a ONE_TIME checklist (there is no next day to replace it).
// Everything else past its end is "missed".

export type RunEndInput = {
    recurrence: string
    verificationStatus: string
    periodStart: Date
    periodEnd: Date
    cutoffTime: string | null
    opensTime: string | null
}

const MINUTE_MS = 60_000

/** The real instant (ms) the run's deadline falls on. */
export const runDeadlineMs = (run: Pick<RunEndInput, "periodStart" | "periodEnd" | "cutoffTime" | "opensTime">, offsetMinutes: number): number => {
    const offsetMs = offsetMinutes * MINUTE_MS
    if (!run.cutoffTime) return run.periodEnd.getTime() - offsetMs
    const [hours, minutes] = run.cutoffTime.split(":").map(Number)
    const dayRoll = run.opensTime && run.cutoffTime < run.opensTime ? 24 * 60 : 0
    return run.periodStart.getTime() + (hours * 60 + minutes + dayRoll) * MINUTE_MS - offsetMs
}

const toMs = (now: Date | number) => (typeof now === "number" ? now : now.getTime())

/** The deadline has been reached (deadline <= now), whatever state the run is in. */
export const hasRunDeadlinePassed = (run: Parameters<typeof runDeadlineMs>[0], now: Date | number, offsetMinutes: number): boolean =>
    runDeadlineMs(run, offsetMinutes) <= toMs(now)

/**
 * The run has ended for the people it is assigned to: past its deadline AND none of the exceptions apply.
 * `totalItems` / `doneItems` are the run's question counts (no questions counts as unfinished).
 */
export const isRunEnded = (
    run: RunEndInput & { totalItems: number; doneItems: number },
    now: Date | number,
    offsetMinutes: number,
): boolean => {
    if (run.recurrence === "ONE_TIME") return false
    if (run.verificationStatus === "REJECTED") return false
    if (run.totalItems > 0 && run.doneItems === run.totalItems) return false
    return hasRunDeadlinePassed(run, now, offsetMinutes)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "6:30 PM on 12 Oct", or "the end of 12 Oct" for a deadline at midnight (no cutoff time). Org-local. */
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

/** Plain words for the person who tried to fill an ended run. */
export const runClosedMessage = (deadlineMs: number, offsetMinutes: number): string =>
    `This checklist closed at ${describeRunEnd(deadlineMs, offsetMinutes)}. It can't be filled in any more. Today's checklist is in My Checklists.`

/** ADMIN and PC may still fill or fix an ended run. */
export const canWorkEndedRun = (user: { role: string }): boolean => user.role === "ADMIN" || user.role === "PC"

/** Throws when this person may not work on the run because it has ended. Reviewers do not call this. */
export const assertRunOpen = (
    run: RunEndInput & { totalItems: number; doneItems: number },
    user: { role: string },
    now: Date | number,
    offsetMinutes: number,
): void => {
    if (canWorkEndedRun(user)) return
    if (!isRunEnded(run, now, offsetMinutes)) return
    throw AppError.badRequest(runClosedMessage(runDeadlineMs(run, offsetMinutes), offsetMinutes))
}
