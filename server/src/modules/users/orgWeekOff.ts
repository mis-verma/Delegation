import { and, eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { refreshLiveChecklistsForUsers } from "./userChecklistSync.js"

export const normalizeWeekOff = <T extends Record<string, unknown>>(input: T): T => {
    const days = input.weekOffDays
    if (!Array.isArray(days)) return input
    const clean = [...new Set(days as number[])].sort((a, b) => a - b)
    return { ...input, weekOffDays: clean.length ? clean : null }
}

export const sameWeekOff = (a: number[] | null | undefined, b: number[] | null | undefined): boolean =>
    JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort())

export const refreshAfterOrgWeekOffChange = async (unit: "store" | "department", id: string, name: string) => {
    const rows = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.isActive, true), unit === "store" ? eq(users.storeId, id) : eq(users.departmentId, id)))
    await refreshLiveChecklistsForUsers(rows.map((r) => r.id), `${unit} ${name} changing its week off`)
}

export const effectiveWeekOff = (person: number[] | null | undefined, store: number[] | null | undefined, department: number[] | null | undefined): number[] =>
    person?.length ? person : store?.length ? store : department?.length ? department : []
