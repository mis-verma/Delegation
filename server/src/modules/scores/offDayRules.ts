import { and, gte, lte } from "drizzle-orm"
import { db } from "../../config/db.js"
import { extraWorkingDays, holidays } from "../../db/schema/core.js"

// Which unfinished runs are NOT work: the same rule the run generator uses (checklistInstanceGenerator.job.ts,
// applyWorkingDayRules). A daily run left unfinished on a company holiday is not a miss, unless an extra
// working day covers the people on it (Sunday overtime and the like). Weekly, monthly and one-time runs span
// several days, so a holiday never cancels them. A finished run always counts.

type ExtraDay = { date: string; scope: "ALL" | "DEPARTMENT" | "STORE" | "PEOPLE"; targetIds: string[] }
export type OffDayRules = { holidayDates: Set<string>; extras: ExtraDay[] }
export type RunAssignee = { id: string; departmentId: string | null; storeId: string | null }

/** Holidays and extra working days between two org-local days (YYYY-MM-DD, both included). */
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

/** True when an extra working day exists on this date at all, so the caller knows to look at the assignees. */
export const hasExtraDay = (rules: OffDayRules, date: string): boolean => rules.extras.some((e) => e.date === date)

/**
 * Should this run be left out because it is an unfinished daily run on a holiday that no extra working day
 * covers? `assignees` are only needed (and may be empty) when `hasExtraDay` is true for the date.
 */
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
        // STORE: the person's home store, or the run's own store when nobody is named.
        return assignees.length ? assignees.some((a) => !!a.storeId && e.targetIds.includes(a.storeId)) : e.targetIds.includes(run.storeId)
    })
    return !covered
}
