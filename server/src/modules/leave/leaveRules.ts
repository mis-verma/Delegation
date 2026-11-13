import { isAdminOrPc } from "../../utils/roles.js"

export type LeaveActor = { sub: string; role: string; departmentId: string | null }
export type LeaveTarget = { id: string; role: string; departmentId: string | null; isActive: boolean }

export const MAX_LEAVE_DAYS = 90
export const MAX_BACKDATE_DAYS = 14
const MAX_HEAD_BACKDATE_DAYS = 1

export const backdateLimitFor = (role: string): number => (isAdminOrPc(role) ? MAX_BACKDATE_DAYS : MAX_HEAD_BACKDATE_DAYS)

const DAY_MS = 86_400_000

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00.000Z`) / DAY_MS

export const eachDay = (from: string, to: string): string[] => {
    const days: string[] = []
    for (let n = dayNumber(from); n <= dayNumber(to); n += 1) days.push(new Date(n * DAY_MS).toISOString().slice(0, 10))
    return days
}

export const rangesOverlap = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean =>
    a.startDate <= b.endDate && b.startDate <= a.endDate

export const rangeProblem = (from: string, to: string, today: string, actorRole: string): string | null => {
    if (from > to) return "The last day can't be before the first day."
    if (eachDay(from, to).length > MAX_LEAVE_DAYS) return `Leave can be at most ${MAX_LEAVE_DAYS} days at a time.`
    const backdate = backdateLimitFor(actorRole)
    if (dayNumber(today) - dayNumber(from) > backdate) return backdate === 1 ? "You can add leave from yesterday onward. Ask an admin for older days." : `Leave can only be added for the last ${backdate} days or later.`
    return null
}

export type LeaveStatus = "PENDING" | "APPROVED" | "DECLINED"
export type LeaveScope = "all" | "department" | "own"

export const leaveScopeFor = (role: string): LeaveScope =>
    role === "ADMIN" || role === "PC" || role === "OWNER" ? "all" : role === "MANAGER" || role === "SENIOR" ? "department" : "own"

export const canAskForOwnLeave = (actor: LeaveActor, target: LeaveTarget): boolean =>
    target.id === actor.sub && target.isActive && actor.role !== "OWNER"

export const statusForNewLeave = (actor: LeaveActor, target: LeaveTarget): LeaveStatus =>
    target.id === actor.sub && !isAdminOrPc(actor.role) ? "PENDING" : "APPROVED"

export const canDecideLeave = (actor: LeaveActor, target: LeaveTarget, status: LeaveStatus): boolean =>
    status === "PENDING" && target.id !== actor.sub && canManageLeave(actor, target)

export const canRemoveLeave = (actor: LeaveActor, target: LeaveTarget, leave: { status: LeaveStatus; startDate: string }, today: string): boolean =>
    canManageLeave(actor, target) || (target.id === actor.sub && actor.role !== "OWNER" && (leave.status !== "APPROVED" || leave.startDate > today))

export const canManageLeave = (actor: LeaveActor, target: LeaveTarget): boolean => {
    if (!target.isActive || target.role === "OWNER") return false
    if (actor.role === "ADMIN" || actor.role === "PC") return true
    if (actor.role !== "MANAGER" && actor.role !== "SENIOR") return false
    if (target.id === actor.sub) return false
    if (target.role === "ADMIN" || target.role === "PC") return false
    return !!actor.departmentId && actor.departmentId === target.departmentId
}
