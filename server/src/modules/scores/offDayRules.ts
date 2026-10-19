import { and, gte, lte } from "drizzle-orm"
import { db } from "../../config/db.js"
import { extraWorkingDays, holidays } from "../../db/schema/core.js"

type ExtraDay = { date: string; scope: "ALL" | "DEPARTMENT" | "STORE" | "PEOPLE"; targetIds: string[] }
export type OffDayRules = { holidayDates: Set<string>; extras: ExtraDay[] }
export type RunAssignee = { id: string; departmentId: string | null; storeId: string | null }

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

export const isIdleHolidayRun = (
    rules: OffDayRules,
    run: { date: string; recurrence: string; complete: boolean; storeId: string },
    assignees: readonly RunAssignee[],
): boolean => {
    if (run.complete || run.recurrence !== "DAILY" || !rules.holidayDates.has(run.date)) return false
    const covered = rules.extras.some((e) => {
        if (e.date !== run.date) return false
        if (e.scope === "ALL") return true
        if (e.scope === "PEOPLE") return assignees.some((a) => e.targetIds.includes(a.id))
        if (e.scope === "DEPARTMENT") return assignees.some((a) => !!a.departmentId && e.targetIds.includes(a.departmentId))
        return assignees.length ? assignees.some((a) => !!a.storeId && e.targetIds.includes(a.storeId)) : e.targetIds.includes(run.storeId)
    })
    return !covered
}
