import { and, inArray, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { checklistInstances, checklistInstanceItems } from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"

// A MISSED run is one nobody finished before its day ended. It keeps counting against completion in
// the reports, but it is not carried into the next day: it leaves everyone's own list, counts and
// reminders, and it can no longer be filled in by the people it was assigned to (an ADMIN/PC still
// can). New day, new checklist. Left alone on purpose:
//  - a one-time checklist (there is no next day to replace it),
//  - a run sent back for fixing (REJECTED), the person has to correct it,
//  - a run that is fully done (just waiting to be submitted or approved).
//
// The deadline is the same rule the rest of the module uses (cutoff time, or the end of the period).
// periodEnd is EXCLUSIVE (a daily run's periodEnd is the next day's midnight), so a run whose
// deadline is at or before today's org-local midnight belongs to an earlier day.

const localNow = sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${env.CHECKLIST_TIMEZONE_OFFSET_MINUTES} MINUTE)`

const deadline = sql`CASE
    WHEN ${checklistInstances.cutoffTime} IS NULL THEN TIMESTAMP(DATE(${checklistInstances.periodEnd}))
    WHEN ${checklistInstances.opensTime} IS NOT NULL AND ${checklistInstances.cutoffTime} < ${checklistInstances.opensTime}
        THEN TIMESTAMP(DATE_ADD(DATE(${checklistInstances.periodStart}), INTERVAL 1 DAY), CONCAT(${checklistInstances.cutoffTime}, ':00'))
    ELSE TIMESTAMP(DATE(${checklistInstances.periodStart}), CONCAT(${checklistInstances.cutoffTime}, ':00'))
END`

// Has no questions, or at least one is still open.
const unfinished = sql`(
    NOT EXISTS (SELECT 1 FROM ${checklistInstanceItems} mi WHERE mi.instanceId = ${checklistInstances.id})
    OR EXISTS (SELECT 1 FROM ${checklistInstanceItems} mi WHERE mi.instanceId = ${checklistInstances.id} AND mi.isDone = 0)
)`

/** SQL condition: this ChecklistInstance row is a missed run. Use `NOT ${...}` to leave them out. */
export const missedFromPastDayExpr = sql`(
    ${checklistInstances.recurrence} <> 'ONE_TIME'
    AND ${checklistInstances.verificationStatus} <> 'REJECTED'
    AND ${unfinished}
    AND ${deadline} <= DATE(${localNow})
)`

/** Which of these runs are missed. One query, however many ids. */
export const missedInstanceIds = async (ids: string[]): Promise<Set<string>> => {
    const unique = [...new Set(ids)]
    if (!unique.length) return new Set()
    const rows = await db.select({ id: checklistInstances.id }).from(checklistInstances)
        .where(and(inArray(checklistInstances.id, unique), missedFromPastDayExpr))
    return new Set(rows.map((r) => r.id))
}

export const MISSED_RUN_MESSAGE = "This checklist's day has ended, so it can't be filled in any more. Today's checklist is in My Checklists."

/** Blocks the people a run was assigned to from working on a missed run. ADMIN/PC are exempt. */
export const assertRunNotMissed = async (instanceId: string, user: { role: string }) => {
    if (user.role === "ADMIN" || user.role === "PC") return
    if ((await missedInstanceIds([instanceId])).size) throw AppError.badRequest(MISSED_RUN_MESSAGE)
}
