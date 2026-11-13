import { and, asc, eq, gte, inArray, isNull, ne, notInArray, or } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { departments, personLeaves, users } from "../../db/schema/core.js"
import { tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { notifySafely } from "../notifications/notificationCore.js"
import { orgLocalDate } from "../checklistInstances/checklistReportRange.js"
import { dropRunsOfPeopleOnLeaveOn, generateDueInstances } from "../../jobs/checklistInstanceGenerator.job.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateLeaveInput } from "./leave.validation.js"
import {
    canAskForOwnLeave, canDecideLeave, canManageLeave, canRemoveLeave, eachDay, leaveScopeFor, rangeProblem, rangesOverlap, statusForNewLeave,
    type LeaveActor, type LeaveTarget,
} from "./leaveRules.js"
import { notifyLeaveDecided, notifyLeaveRequested } from "./leaveNotifications.js"

const LIST_LOOKBACK_DAYS = 30
const DAY_MS = 86_400_000

const nameOf = (u: { firstName: string; lastName: string | null }) => `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`

const actorOf = (actor: AccessTokenPayload): LeaveActor => ({ sub: actor.sub, role: actor.role, departmentId: actor.departmentId ?? null })

type Target = LeaveTarget & { firstName: string; lastName: string | null }

const loadTarget = async (userId: string): Promise<Target | null> => {
    const [row] = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId, isActive: users.isActive, firstName: users.firstName, lastName: users.lastName })
        .from(users).where(eq(users.id, userId)).limit(1)
    return row ?? null
}

const assertCanCreate = async (actor: AccessTokenPayload, userId: string) => {
    const target = await loadTarget(userId)
    if (!target) throw AppError.notFound("Person not found")
    const who = actorOf(actor)
    if (!canManageLeave(who, target) && !canAskForOwnLeave(who, target)) {
        throw AppError.forbidden("You can ask for your own leave, or record leave for people in your own department.")
    }
    return target
}

const loadLeave = async (id: string) => {
    const [leave] = await db.select().from(personLeaves).where(eq(personLeaves.id, id)).limit(1)
    if (!leave) throw AppError.notFound("Leave not found")
    const target = await loadTarget(leave.userId)
    if (!target) throw AppError.notFound("Person not found")
    return { leave, target }
}

const dropRunsFor = async (userId: string, startDate: string, endDate: string) => {
    let removed = 0
    for (const day of eachDay(startDate, endDate)) removed += await dropRunsOfPeopleOnLeaveOn(day, [userId])
    return removed
}

const openItemCounts = async (userIds: string[]) => {
    const counts = new Map<string, { tickets: number; delegations: number }>()
    for (const id of userIds) counts.set(id, { tickets: 0, delegations: 0 })
    if (!userIds.length) return counts
    const openTickets = await db.select({ assigneeId: tickets.assigneeId }).from(tickets).where(and(
        inArray(tickets.assigneeId, userIds), isNull(tickets.deletedAt), isNull(tickets.declinedAt), notInArray(tickets.status, ["CLOSED"]),
    ))
    for (const t of openTickets) if (t.assigneeId) counts.get(t.assigneeId)!.tickets += 1
    const openTasks = await db.select({ assigneeId: tasks.assigneeId }).from(tasks).where(and(
        inArray(tasks.assigneeId, userIds), isNull(tasks.deletedAt), isNull(tasks.declinedAt), notInArray(tasks.status, ["done", "draft"]),
    ))
    for (const t of openTasks) if (t.assigneeId) counts.get(t.assigneeId)!.delegations += 1
    return counts
}

const scopeWhere = (actor: AccessTokenPayload) => {
    const scope = leaveScopeFor(actor.role)
    if (scope === "all") return undefined
    if (scope === "department") return actor.departmentId ? eq(users.departmentId, actor.departmentId) : eq(users.id, actor.sub)
    const own = eq(personLeaves.userId, actor.sub)
    return actor.departmentId ? or(own, and(eq(users.departmentId, actor.departmentId), eq(personLeaves.status, "APPROVED"))) : own
}

export const leaveService = {
    async list(actor: AccessTokenPayload) {
        const since = orgLocalDate(Date.now() - LIST_LOOKBACK_DAYS * DAY_MS)
        const rows = await db.select({
            id: personLeaves.id,
            userId: personLeaves.userId,
            startDate: personLeaves.startDate,
            endDate: personLeaves.endDate,
            reason: personLeaves.reason,
            status: personLeaves.status,
            decidedBy: personLeaves.decidedBy,
            decidedAt: personLeaves.decidedAt,
            declineNote: personLeaves.declineNote,
            createdAt: personLeaves.createdAt,
            createdBy: personLeaves.createdBy,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            isActive: users.isActive,
            departmentId: users.departmentId,
            departmentName: departments.name,
        })
            .from(personLeaves)
            .innerJoin(users, eq(users.id, personLeaves.userId))
            .leftJoin(departments, eq(departments.id, users.departmentId))
            .where(and(gte(personLeaves.endDate, since), scopeWhere(actor)))
            .orderBy(asc(personLeaves.startDate))

        const who = actorOf(actor)
        const limitedView = leaveScopeFor(actor.role) === "own"
        const isLimited = (r: (typeof rows)[number]) => limitedView && r.userId !== actor.sub
        const peopleIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.decidedBy]).filter((id): id is string => !!id))]
        const named = peopleIds.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, peopleIds)) : []
        const nameById = new Map(named.map((c) => [c.id, nameOf(c)]))
        const today = orgLocalDate(Date.now())
        const current = [...new Set(rows.filter((r) => r.endDate >= today && r.status !== "DECLINED" && !isLimited(r)).map((r) => r.userId))]
        const open = await openItemCounts(current)

        return rows.map((r) => {
            const limited = isLimited(r)
            const target: LeaveTarget = { id: r.userId, role: r.role, departmentId: r.departmentId, isActive: r.isActive }
            const showOpen = !limited && r.endDate >= today && r.status !== "DECLINED"
            return {
                id: r.id,
                userId: r.userId,
                userName: nameOf(r),
                departmentName: r.departmentName ?? null,
                startDate: r.startDate,
                endDate: r.endDate,
                status: r.status,
                reason: limited ? null : r.reason ?? null,
                declineNote: limited ? null : r.declineNote ?? null,
                createdByName: limited ? null : nameById.get(r.createdBy) ?? null,
                decidedByName: limited || !r.decidedBy ? null : nameById.get(r.decidedBy) ?? null,
                decidedAt: limited ? null : r.decidedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                openTickets: showOpen ? open.get(r.userId)?.tickets ?? 0 : 0,
                openDelegations: showOpen ? open.get(r.userId)?.delegations ?? 0 : 0,
                mine: r.userId === actor.sub,
                canDecide: canDecideLeave(who, target, r.status),
                canRemove: canRemoveLeave(who, target, r, today),
            }
        })
    },

    async preview(actor: AccessTokenPayload, userId: string, startDate: string, endDate: string) {
        await assertCanCreate(actor, userId)
        const problem = rangeProblem(startDate, endDate, orgLocalDate(Date.now()), actor.role)
        if (problem) throw AppError.badRequest(problem)
        let runs = 0
        for (const day of eachDay(startDate, endDate)) runs += await dropRunsOfPeopleOnLeaveOn(day, [userId], false)
        const open = (await openItemCounts([userId])).get(userId)!
        return { runs, openTickets: open.tickets, openDelegations: open.delegations }
    },

    async create(input: CreateLeaveInput, actor: AccessTokenPayload) {
        const target = await assertCanCreate(actor, input.userId)
        const problem = rangeProblem(input.startDate, input.endDate, orgLocalDate(Date.now()), actor.role)
        if (problem) throw AppError.badRequest(problem)

        const existing = await db.select().from(personLeaves).where(and(eq(personLeaves.userId, input.userId), ne(personLeaves.status, "DECLINED")))
        if (existing.some((e) => rangesOverlap(e, input))) {
            throw AppError.conflict(target.id === actor.sub ? "You already have leave or a request on some of those days." : `${nameOf(target)} already has leave on some of those days.`)
        }

        const status = statusForNewLeave(actorOf(actor), target)
        const id = createId()
        await db.insert(personLeaves).values({
            id, userId: input.userId, startDate: input.startDate, endDate: input.endDate, reason: input.reason || null, status, createdBy: actor.sub,
            ...(status === "APPROVED" ? { decidedBy: actor.sub, decidedAt: new Date() } : {}),
        })
        const [leave] = await db.select().from(personLeaves).where(eq(personLeaves.id, id)).limit(1)
        await auditService.record({ entityType: "PersonLeave", entityId: id, action: "CREATE", actorId: actor.sub, after: leave })

        if (status === "PENDING") {
            void notifySafely(() => notifyLeaveRequested({ id: target.id, name: nameOf(target), departmentId: target.departmentId }, input.startDate, input.endDate))
            return { leave, status, removedRuns: 0, openTickets: 0, openDelegations: 0 }
        }
        const removedRuns = await dropRunsFor(input.userId, input.startDate, input.endDate)
        const open = (await openItemCounts([input.userId])).get(input.userId)!
        return { leave, status, removedRuns, openTickets: open.tickets, openDelegations: open.delegations }
    },

    async decide(id: string, approve: boolean, note: string | undefined, actor: AccessTokenPayload) {
        const { leave, target } = await loadLeave(id)
        if (leave.status !== "PENDING") throw AppError.conflict("Someone already decided on this request. Refresh to see where it stands.")
        if (!canDecideLeave(actorOf(actor), target, leave.status)) throw AppError.forbidden("You can only decide leave for people in your own department.")

        const status = approve ? "APPROVED" : "DECLINED"
        const declineNote = approve ? null : note || null
        const [result] = await db.update(personLeaves)
            .set({ status, decidedBy: actor.sub, decidedAt: new Date(), declineNote })
            .where(and(eq(personLeaves.id, id), eq(personLeaves.status, "PENDING")))
        if (result.affectedRows === 0) throw AppError.conflict("Someone already decided on this request. Refresh to see where it stands.")
        await auditService.record({ entityType: "PersonLeave", entityId: id, action: approve ? "APPROVE" : "DECLINE", actorId: actor.sub, before: leave, after: { ...leave, status, declineNote } })

        const decider = await loadTarget(actor.sub)
        void notifySafely(() => notifyLeaveDecided(target.id, approve, decider ? nameOf(decider) : "Your manager", leave.startDate, leave.endDate, declineNote))
        const removedRuns = approve ? await dropRunsFor(leave.userId, leave.startDate, leave.endDate) : 0
        return { status, removedRuns }
    },

    async remove(id: string, actor: AccessTokenPayload) {
        const { leave, target } = await loadLeave(id)
        if (!canRemoveLeave(actorOf(actor), target, leave, orgLocalDate(Date.now()))) {
            throw AppError.forbidden(target.id === actor.sub ? "Leave that has already started can only be removed by your manager." : "You can only remove leave for people in your own department.")
        }
        await db.delete(personLeaves).where(eq(personLeaves.id, id))
        await auditService.record({ entityType: "PersonLeave", entityId: id, action: "DELETE", actorId: actor.sub, before: leave })
        if (leave.status === "APPROVED") generateDueInstances().catch((err) => console.error("Bringing back checklists after leave was removed failed:", err))
        return leave
    },
}
