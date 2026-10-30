import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { checklistInstances, checklistInstanceItems } from "../../db/schema/index.js"
import { assertRunOpen, canWorkEndedRun } from "./checklistRunEnd.js"
import { assertNoSendBackBlock } from "./checklistSendBackBlock.js"

export const localNowSql = sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${env.CHECKLIST_TIMEZONE_OFFSET_MINUTES} MINUTE)`

export const runDeadlineSql = sql`CASE
    WHEN ${checklistInstances.cutoffTime} IS NULL THEN TIMESTAMP(DATE(${checklistInstances.periodEnd}))
    WHEN ${checklistInstances.opensTime} IS NOT NULL AND ${checklistInstances.cutoffTime} < ${checklistInstances.opensTime}
        THEN TIMESTAMP(DATE_ADD(DATE(${checklistInstances.periodStart}), INTERVAL 1 DAY), CONCAT(${checklistInstances.cutoffTime}, ':00'))
    ELSE TIMESTAMP(DATE(${checklistInstances.periodStart}), CONCAT(${checklistInstances.cutoffTime}, ':00'))
END`

export const runClosingSql = sql`CASE
    WHEN ${checklistInstances.cutoffTime} IS NOT NULL AND ${checklistInstances.lateUntilTime} IS NOT NULL
        THEN DATE_ADD(${runDeadlineSql}, INTERVAL GREATEST(0, TIME_TO_SEC(TIMEDIFF(CONCAT(${checklistInstances.lateUntilTime}, ':00'), CONCAT(${checklistInstances.cutoffTime}, ':00')))) SECOND)
    ELSE ${runDeadlineSql}
END`

const unfinished = sql`(
    NOT EXISTS (SELECT 1 FROM ${checklistInstanceItems} mi WHERE mi.instanceId = ${checklistInstances.id})
    OR EXISTS (SELECT 1 FROM ${checklistInstanceItems} mi WHERE mi.instanceId = ${checklistInstances.id} AND mi.isDone = 0)
)`

export const missedFromPastDayExpr = sql`(
    ${checklistInstances.recurrence} <> 'ONE_TIME'
    AND ${checklistInstances.verificationStatus} <> 'REJECTED'
    AND ${unfinished}
    AND ${runDeadlineSql} <= ${localNowSql}
)`

export const closedFromPastDayExpr = sql`(
    ${checklistInstances.recurrence} <> 'ONE_TIME'
    AND ${checklistInstances.verificationStatus} <> 'REJECTED'
    AND ${unfinished}
    AND ${runClosingSql} <= ${localNowSql}
)`

export const closedBeforeTodayExpr = sql`(${closedFromPastDayExpr} AND ${runClosingSql} < DATE(${localNowSql}))`

export const missedInstanceIds = async (ids: string[]): Promise<Set<string>> => {
    const unique = [...new Set(ids)]
    if (!unique.length) return new Set()
    const rows = await db.select({ id: checklistInstances.id }).from(checklistInstances)
        .where(and(inArray(checklistInstances.id, unique), missedFromPastDayExpr))
    return new Set(rows.map((r) => r.id))
}

export const assertRunOpenForUser = async (instanceId: string, user: { role: string; sub?: string }, now: Date = new Date()) => {
    if (canWorkEndedRun(user)) return
    const [run] = await db.select({
        recurrence: checklistInstances.recurrence,
        verificationStatus: checklistInstances.verificationStatus,
        periodStart: checklistInstances.periodStart,
        periodEnd: checklistInstances.periodEnd,
        cutoffTime: checklistInstances.cutoffTime,
        opensTime: checklistInstances.opensTime,
        lateUntilTime: checklistInstances.lateUntilTime,
        totalItems: sql<number>`COUNT(${checklistInstanceItems.id})`,
        doneItems: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
    })
        .from(checklistInstances)
        .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(eq(checklistInstances.id, instanceId))
        .groupBy(
            checklistInstances.id, checklistInstances.recurrence, checklistInstances.verificationStatus,
            checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime, checklistInstances.opensTime, checklistInstances.lateUntilTime,
        )
    if (!run) return
    await assertNoSendBackBlock(instanceId, run.verificationStatus, user.sub, now)
    assertRunOpen({ ...run, totalItems: Number(run.totalItems), doneItems: Number(run.doneItems) }, user, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
}
