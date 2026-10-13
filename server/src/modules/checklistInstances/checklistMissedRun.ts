import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { checklistInstances, checklistInstanceItems } from "../../db/schema/index.js"
import { assertRunOpen, canWorkEndedRun } from "./checklistRunEnd.js"

// A MISSED run is one nobody finished before it ENDED (its deadline: the cutoff time, or the end of its
// period when it has none). It keeps counting against completion in the reports, but it leaves the people's
// own lists, counts and reminders, and it can no longer be filled in by the people it was assigned to
// (an ADMIN/PC still can). Left alone on purpose:
//  - a one-time checklist (there is no next day to replace it),
//  - a run sent back for fixing (REJECTED), the person has to correct it,
//  - a run that is fully done (just waiting to be submitted or approved).
//
// This file is the SQL twin of checklistRunEnd.ts (the pure TypeScript version, unit tested). Both read the
// deadline the same way: cutoff time on the start day, the NEXT day for an overnight window (cutoff earlier
// than opens), else the end of the period (periodEnd is EXCLUSIVE, so a daily run's periodEnd is the next
// day's midnight). A run is ended when deadline <= the org-local "now".

export const localNowSql = sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${env.CHECKLIST_TIMEZONE_OFFSET_MINUTES} MINUTE)`

export const runDeadlineSql = sql`CASE
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

/** SQL condition: this ChecklistInstance row is a missed (ended) run. Use `NOT ${...}` to leave them out. */
export const missedFromPastDayExpr = sql`(
    ${checklistInstances.recurrence} <> 'ONE_TIME'
    AND ${checklistInstances.verificationStatus} <> 'REJECTED'
    AND ${unfinished}
    AND ${runDeadlineSql} <= ${localNowSql}
)`

/** Which of these runs are missed. One query, however many ids. */
export const missedInstanceIds = async (ids: string[]): Promise<Set<string>> => {
    const unique = [...new Set(ids)]
    if (!unique.length) return new Set()
    const rows = await db.select({ id: checklistInstances.id }).from(checklistInstances)
        .where(and(inArray(checklistInstances.id, unique), missedFromPastDayExpr))
    return new Set(rows.map((r) => r.id))
}

/**
 * Blocks the people a run was assigned to from working on it once it has ended. ADMIN/PC are exempt.
 * Call it from EVERY path that changes a run's answers, photos or submission. Reviewers (verify, send back,
 * waive) do not call it: they act on submitted and missed runs. A run that does not exist is left to the
 * caller's own not-found handling.
 */
export const assertRunOpenForUser = async (instanceId: string, user: { role: string }, now: Date = new Date()) => {
    if (canWorkEndedRun(user)) return
    const [run] = await db.select({
        recurrence: checklistInstances.recurrence,
        verificationStatus: checklistInstances.verificationStatus,
        periodStart: checklistInstances.periodStart,
        periodEnd: checklistInstances.periodEnd,
        cutoffTime: checklistInstances.cutoffTime,
        opensTime: checklistInstances.opensTime,
        totalItems: sql<number>`COUNT(${checklistInstanceItems.id})`,
        doneItems: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
    })
        .from(checklistInstances)
        .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(eq(checklistInstances.id, instanceId))
        .groupBy(
            checklistInstances.id, checklistInstances.recurrence, checklistInstances.verificationStatus,
            checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime, checklistInstances.opensTime,
        )
    if (!run) return
    assertRunOpen({ ...run, totalItems: Number(run.totalItems), doneItems: Number(run.doneItems) }, user, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
}
