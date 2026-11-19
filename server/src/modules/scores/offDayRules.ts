import { and, gte, lte, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { extraWorkingDays, holidays, users } from "../../db/schema/core.js"
import { checklistInstanceAssignees, checklistInstanceItems } from "../../db/schema/checklistInstance.js"
import { isIdleHolidayRunFor, type ExtraDayScope, type WorkingPerson } from "./workingDayRules.js"

type ExtraDay = { date: string; scope: ExtraDayScope; targetIds: string[] }
export type OffDayRules = { holidayDates: Set<string>; extras: ExtraDay[] }
export type RunAssignee = WorkingPerson

export const loadOffDayRules = async (from: string, to: string): Promise<OffDayRules> => {
    const [holidayRows, extraRows] = await Promise.all([
        db.select({ date: holidays.date }).from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))),
        db.select({ date: extraWorkingDays.date, scope: extraWorkingDays.scope, targetIds: extraWorkingDays.targetIds }).from(extraWorkingDays).where(and(gte(extraWorkingDays.date, from), lte(extraWorkingDays.date, to))),
    ])
    return {
        holidayDates: new Set(holidayRows.map((h) => h.date)),
        extras: extraRows.map((e) => ({ date: e.date, scope: e.scope, targetIds: e.targetIds ?? [] })),
    }
}

export const hasExtraDay = (rules: OffDayRules, date: string): boolean => rules.extras.some((e) => e.date === date)

export const notIdleHolidayRunSql = (run: string): SQL => {
    const ci = sql.raw(run)
    const day = sql`DATE_FORMAT(${ci}.periodStart, '%Y-%m-%d')`
    return sql`NOT (
        ${ci}.recurrence <> 'ONE_TIME'
        AND EXISTS (SELECT 1 FROM ${holidays} h WHERE h.date = ${day})
        AND (NOT EXISTS (SELECT 1 FROM ${checklistInstanceItems} hi WHERE hi.instanceId = ${ci}.id)
             OR EXISTS (SELECT 1 FROM ${checklistInstanceItems} hi WHERE hi.instanceId = ${ci}.id AND hi.isDone = 0))
        AND NOT EXISTS (
            SELECT 1 FROM ${extraWorkingDays} xd WHERE xd.date = ${day} AND (
                xd.scope = 'ALL'
                OR EXISTS (
                    SELECT 1 FROM ${checklistInstanceAssignees} xa JOIN ${users} xu ON xu.id = xa.userId
                    WHERE xa.instanceId = ${ci}.id AND (
                        (xd.scope = 'PEOPLE' AND JSON_CONTAINS(xd.targetIds, JSON_QUOTE(xu.id)))
                        OR (xd.scope = 'DEPARTMENT' AND xu.departmentId IS NOT NULL AND JSON_CONTAINS(xd.targetIds, JSON_QUOTE(xu.departmentId)))
                        OR (xd.scope = 'STORE' AND xu.storeId IS NOT NULL AND JSON_CONTAINS(xd.targetIds, JSON_QUOTE(xu.storeId)))
                    )
                )
                OR (xd.scope = 'STORE'
                    AND NOT EXISTS (SELECT 1 FROM ${checklistInstanceAssignees} xn WHERE xn.instanceId = ${ci}.id)
                    AND JSON_CONTAINS(xd.targetIds, JSON_QUOTE(${ci}.storeId)))
            )
        )
    )`
}

export const isIdleHolidayRun = (
    rules: OffDayRules,
    run: { date: string; recurrence: string; complete: boolean; storeId: string },
    assignees: readonly RunAssignee[],
): boolean =>
    isIdleHolidayRunFor(
        { recurrence: run.recurrence, complete: run.complete, storeId: run.storeId, onHoliday: rules.holidayDates.has(run.date) },
        rules.extras.filter((e) => e.date === run.date),
        assignees,
    )
