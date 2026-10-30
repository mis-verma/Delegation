import { and, asc, eq, gte, inArray, isNull, notInArray } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { departments, personLeaves, users } from "../../db/schema/core.js"
import { tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { orgLocalDate } from "../checklistInstances/checklistReportRange.js"
import { dropRunsOfPeopleOnLeaveOn, generateDueInstances } from "../../jobs/checklistInstanceGenerator.job.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateLeaveInput } from "./leave.validation.js"
import { canManageLeave, eachDay, rangeProblem, rangesOverlap, type LeaveTarget } from "./leaveRules.js"

const LIST_LOOKBACK_DAYS = 30
const DAY_MS = 86_400_000

const nameOf = (u: { firstName: string; lastName: string | null }) => `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`

const loadTarget = async (userId: string): Promise<(LeaveTarget & { firstName: string; lastName: string | null }) | null> => {
    const [row] = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId, isActive: users.isActive, firstName: users.firstName, lastName: users.lastName })
        .from(users).where(eq(users.id, userId)).limit(1)
    return row ?? null
}

const assertCanManage = async (actor: AccessTokenPayload, userId: string) => {
    const target = await loadTarget(userId)
    if (!target) throw AppError.notFound("Person not found")
    if (!canManageLeave({ sub: actor.sub, role: actor.role, departmentId: actor.departmentId ?? null }, target)) {
        throw AppError.forbidden("You can only record leave for people in your own department.")
    }
    return target
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

export const leaveService = {
    async list(actor: AccessTokenPayload) {
        const since = orgLocalDate(Date.now() - LIST_LOOKBACK_DAYS * DAY_MS)
        const scope = actor.role === "ADMIN" || actor.role === "PC"
            ? undefined
            : actor.departmentId ? eq(users.departmentId, actor.departmentId) : eq(users.id, "")
        const rows = await db.select({
            id: personLeaves.id,
            userId: personLeaves.userId,
            startDate: personLeaves.startDate,
            endDate: personLeaves.endDate,
            reason: personLeaves.reason,
            createdAt: personLeaves.createdAt,
            createdBy: personLeaves.createdBy,
            firstName: users.firstName,
            lastName: users.lastName,
            departmentName: departments.name,
        })
            .from(personLeaves)
            .innerJoin(users, eq(users.id, personLeaves.userId))
            .leftJoin(departments, eq(departments.id, users.departmentId))
            .where(and(gte(personLeaves.endDate, since), scope))
            .orderBy(asc(personLeaves.startDate))
        const creators = rows.length
            ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.createdBy))]))
            : []
        const creatorName = new Map(creators.map((c) => [c.id, nameOf(c)]))
        const today = orgLocalDate(Date.now())
        const current = [...new Set(rows.filter((r) => r.endDate >= today).map((r) => r.userId))]
        const open = await openItemCounts(current)
        return rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            userName: nameOf(r),
            departmentName: r.departmentName ?? null,
            startDate: r.startDate,
            endDate: r.endDate,
            reason: r.reason ?? null,
            createdByName: creatorName.get(r.createdBy) ?? null,
            createdAt: r.createdAt.toISOString(),
            openTickets: r.endDate >= today ? open.get(r.userId)?.tickets ?? 0 : 0,
            openDelegations: r.endDate >= today ? open.get(r.userId)?.delegations ?? 0 : 0,
        }))
    },

    async preview(actor: AccessTokenPayload, userId: string, startDate: string, endDate: string) {
        await assertCanManage(actor, userId)
        const problem = rangeProblem(startDate, endDate, orgLocalDate(Date.now()), actor.role)
        if (problem) throw AppError.badRequest(problem)
        let runs = 0
        for (const day of eachDay(startDate, endDate)) runs += await dropRunsOfPeopleOnLeaveOn(day, [userId], false)
        const open = (await openItemCounts([userId])).get(userId)!
        return { runs, openTickets: open.tickets, openDelegations: open.delegations }
    },

    async create(input: CreateLeaveInput, actor: AccessTokenPayload) {
        const target = await assertCanManage(actor, input.userId)
        const problem = rangeProblem(input.startDate, input.endDate, orgLocalDate(Date.now()), actor.role)
        if (problem) throw AppError.badRequest(problem)

        const existing = await db.select().from(personLeaves).where(eq(personLeaves.userId, input.userId))
        if (existing.some((e) => rangesOverlap(e, input))) throw AppError.conflict(`${nameOf(target)} already has leave on some of those days.`)

        const id = createId()
        await db.insert(personLeaves).values({ id, userId: input.userId, startDate: input.startDate, endDate: input.endDate, reason: input.reason || null, createdBy: actor.sub })
        const [leave] = await db.select().from(personLeaves).where(eq(personLeaves.id, id)).limit(1)
        await auditService.record({ entityType: "PersonLeave", entityId: id, action: "CREATE", actorId: actor.sub, after: leave })

        let removedRuns = 0
        for (const day of eachDay(input.startDate, input.endDate)) removedRuns += await dropRunsOfPeopleOnLeaveOn(day, [input.userId])
        const open = (await openItemCounts([input.userId])).get(input.userId)!
        return { leave, removedRuns, openTickets: open.tickets, openDelegations: open.delegations }
    },

    async remove(id: string, actor: AccessTokenPayload) {
        const [leave] = await db.select().from(personLeaves).where(eq(personLeaves.id, id)).limit(1)
        if (!leave) throw AppError.notFound("Leave not found")
        await assertCanManage(actor, leave.userId)
        await db.delete(personLeaves).where(eq(personLeaves.id, id))
        await auditService.record({ entityType: "PersonLeave", entityId: id, action: "DELETE", actorId: actor.sub, before: leave })
        generateDueInstances().catch((err) => console.error("Bringing back checklists after leave was removed failed:", err))
        return leave
    },
}
