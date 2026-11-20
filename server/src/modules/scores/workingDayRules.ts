export type ExtraDayScope = "ALL" | "DEPARTMENT" | "STORE" | "PEOPLE"
export type ExtraDayRule = { scope: ExtraDayScope; targetIds: readonly string[] }
export type WorkingPerson = { id: string; departmentId: string | null; storeId: string | null }

export const holidayApplies = (recurrence: string): boolean => recurrence !== "ONE_TIME"

const dayStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_LOOKAHEAD_DAYS = 60

export const firstWorkingDate = (periodStart: Date, periodEnd: Date, holidaySet: ReadonlySet<string>): string | null => {
    const capEndMs = Math.min(periodEnd.getTime(), periodStart.getTime() + MAX_LOOKAHEAD_DAYS * DAY_MS)
    for (let ms = periodStart.getTime(); ms <= capEndMs; ms += DAY_MS) {
        const ds = dayStr(ms)
        if (!holidaySet.has(ds)) return ds
    }
    return null
}

export const extraDayCovers = (extra: ExtraDayRule, person: WorkingPerson): boolean => {
    if (extra.scope === "ALL") return true
    if (extra.scope === "PEOPLE") return extra.targetIds.includes(person.id)
    if (extra.scope === "DEPARTMENT") return !!person.departmentId && extra.targetIds.includes(person.departmentId)
    return !!person.storeId && extra.targetIds.includes(person.storeId)
}

export type WorkingDayContext<P> = {
    daily: boolean
    holiday: boolean
    weekday: number
    activeWeekdays: readonly number[] | null
    extras: readonly ExtraDayRule[]
    onLeave: ReadonlySet<string>
    offDaysOf: (person: P) => readonly number[]
}

export const isScheduledDay = (ctx: Pick<WorkingDayContext<unknown>, "daily" | "holiday" | "weekday" | "activeWeekdays">): boolean =>
    !ctx.holiday && (!ctx.daily || !ctx.activeWeekdays || ctx.activeWeekdays.includes(ctx.weekday))

export const workingPeople = <P extends WorkingPerson & { isActive: boolean }>(people: readonly P[], ctx: WorkingDayContext<P>): P[] => {
    const dayOn = isScheduledDay(ctx)
    return people.filter((p) => {
        if (!p.isActive || ctx.onLeave.has(p.id)) return false
        if (ctx.extras.some((e) => extraDayCovers(e, p))) return true
        return dayOn && (!ctx.daily || !ctx.offDaysOf(p).includes(ctx.weekday))
    })
}

export const storesWithoutAssigneesOn = (
    storeIds: readonly string[],
    extras: readonly ExtraDayRule[],
): string[] => {
    if (extras.some((e) => e.scope === "ALL")) return [...storeIds]
    const covered = new Set(extras.filter((e) => e.scope === "STORE").flatMap((e) => e.targetIds))
    return storeIds.filter((id) => covered.has(id))
}

export const isIdleHolidayRunFor = (
    run: { recurrence: string; complete: boolean; storeId: string; onHoliday: boolean },
    extras: readonly ExtraDayRule[],
    assignees: readonly WorkingPerson[],
): boolean => {
    if (run.complete || !run.onHoliday || !holidayApplies(run.recurrence)) return false
    const covered = assignees.length
        ? extras.some((e) => assignees.some((a) => extraDayCovers(e, a)))
        : storesWithoutAssigneesOn([run.storeId], extras).length > 0
    return !covered
}
