export type LeaveActor = { sub: string; role: string; departmentId: string | null }
export type LeaveTarget = { id: string; role: string; departmentId: string | null; isActive: boolean }

export const MAX_LEAVE_DAYS = 90
export const MAX_BACKDATE_DAYS = 14

const DAY_MS = 86_400_000

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00.000Z`) / DAY_MS

export const eachDay = (from: string, to: string): string[] => {
    const days: string[] = []
    for (let n = dayNumber(from); n <= dayNumber(to); n += 1) days.push(new Date(n * DAY_MS).toISOString().slice(0, 10))
    return days
}

export const rangesOverlap = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean =>
    a.startDate <= b.endDate && b.startDate <= a.endDate

export const rangeProblem = (from: string, to: string, today: string): string | null => {
    if (from > to) return "The last day can't be before the first day."
    if (eachDay(from, to).length > MAX_LEAVE_DAYS) return `Leave can be at most ${MAX_LEAVE_DAYS} days at a time.`
    if (dayNumber(today) - dayNumber(from) > MAX_BACKDATE_DAYS) return `Leave can only be added for the last ${MAX_BACKDATE_DAYS} days or later.`
    return null
}

export const canManageLeave = (actor: LeaveActor, target: LeaveTarget): boolean => {
    if (!target.isActive || target.role === "OWNER") return false
    if (actor.role === "ADMIN" || actor.role === "PC") return true
    if (actor.role !== "MANAGER" && actor.role !== "SENIOR") return false
    if (target.id === actor.sub) return false
    if (target.role === "ADMIN" || target.role === "PC") return false
    return !!actor.departmentId && actor.departmentId === target.departmentId
}
