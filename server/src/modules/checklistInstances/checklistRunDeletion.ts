import { and, asc, count, eq, gte, inArray, lt, notInArray, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstances, checklistInstanceAssignees, notifications, users } from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { auditService } from "../audit/audit.service.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { dropChecklistSummaries } from "./checklistInstanceShared.js"
export { dayRange } from "./cleanupDays.js"

const BATCH = 200
export const MAX_TEST_RUNS = 20000

const assertAdmin = (user: AccessTokenPayload) => {
    if (user.role !== "ADMIN") throw AppError.forbidden("Only an admin can delete checklist runs.")
}

const assigneesOf = async (ids: string[]): Promise<string[]> => {
    const found = new Set<string>()
    for (let i = 0; i < ids.length; i += BATCH) {
        const rows = await db.selectDistinct({ userId: checklistInstanceAssignees.userId })
            .from(checklistInstanceAssignees)
            .where(inArray(checklistInstanceAssignees.instanceId, ids.slice(i, i + BATCH)))
        rows.forEach((r) => found.add(r.userId))
    }
    return [...found]
}

const removeRuns = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH)
        await db.transaction(async (tx) => {
            await tx.delete(notifications).where(inArray(notifications.checklistInstanceId, chunk))
            await tx.delete(checklistInstances).where(inArray(checklistInstances.id, chunk))
        })
    }
}

export const deleteRun = async (id: string, reason: string, user: AccessTokenPayload) => {
    assertAdmin(user)
    const note = reason.trim()
    if (!note) throw AppError.badRequest("Say why this run is being deleted.")
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("This checklist run was already deleted.")
    const assigneeIds = await assigneesOf([id])

    await removeRuns([id])

    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "DELETE", actorId: user.sub,
        before: { title: instance.title, storeId: instance.storeId, periodStart: instance.periodStart, verificationStatus: instance.verificationStatus, submittedAt: instance.submittedAt, assigneeIds },
        after: { reason: note },
    })
    await dropChecklistSummaries(assigneeIds)
    emitChecklistEvent("checklist-instance:deleted", { storeId: instance.storeId }, { instanceId: id })
    return { deleted: 1 }
}

export type TestRunFilter = { userIds?: string[]; definitionIds?: string[]; from?: Date; to?: Date }

const hasScope = (filter: TestRunFilter) => !!filter.userIds?.length || !!filter.definitionIds?.length || !!filter.to

const runConditions = (filter: TestRunFilter): SQL[] => [
    ...(filter.definitionIds?.length ? [inArray(checklistInstances.definitionId, filter.definitionIds)] : []),
    ...(filter.from ? [gte(checklistInstances.periodStart, filter.from)] : []),
    ...(filter.to ? [lt(checklistInstances.periodStart, filter.to)] : []),
]

const matchingRunIds = async (filter: TestRunFilter): Promise<string[]> => {
    if (!hasScope(filter)) throw AppError.badRequest("Pick some checklists, some people, or an end date first.")
    const people = [...new Set(filter.userIds ?? [])]
    const conditions = runConditions(filter)

    if (!people.length) {
        const rows = await db.select({ id: checklistInstances.id }).from(checklistInstances)
            .where(conditions.length ? and(...conditions) : undefined)
            .limit(MAX_TEST_RUNS + 1)
        return rows.map((r) => r.id)
    }

    const linked = await db.selectDistinct({ id: checklistInstanceAssignees.instanceId })
        .from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .where(and(inArray(checklistInstanceAssignees.userId, people), ...conditions))
        .limit(MAX_TEST_RUNS + 1)
    const ids = linked.map((r) => r.id)
    if (!ids.length) return []
    const shared = new Set<string>()
    for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH)
        const others = await db.selectDistinct({ id: checklistInstanceAssignees.instanceId })
            .from(checklistInstanceAssignees)
            .where(and(inArray(checklistInstanceAssignees.instanceId, chunk), notInArray(checklistInstanceAssignees.userId, people)))
        others.forEach((r) => shared.add(r.id))
    }
    return ids.filter((id) => !shared.has(id))
}

const assertWithinCap = (ids: string[]) => {
    if (ids.length > MAX_TEST_RUNS) throw AppError.badRequest(`More than ${MAX_TEST_RUNS} runs match. Pick fewer checklists or a shorter date range.`)
}

export const previewTestRuns = async (filter: TestRunFilter, user: AccessTokenPayload) => {
    assertAdmin(user)
    const ids = await matchingRunIds(filter)
    assertWithinCap(ids)
    const byStatus = { notSubmitted: 0, pending: 0, approved: 0 }
    let sample: { id: string; title: string; periodStart: Date; verificationStatus: string }[] = []
    if (ids.length) {
        for (let i = 0; i < ids.length; i += 1000) {
            const rows = await db.select({ status: checklistInstances.verificationStatus, n: count() })
                .from(checklistInstances).where(inArray(checklistInstances.id, ids.slice(i, i + 1000)))
                .groupBy(checklistInstances.verificationStatus)
            for (const r of rows) {
                if (r.status === "APPROVED") byStatus.approved += Number(r.n)
                else if (r.status === "PENDING_APPROVAL") byStatus.pending += Number(r.n)
                else byStatus.notSubmitted += Number(r.n)
            }
        }
        sample = await db.select({ id: checklistInstances.id, title: checklistInstances.title, periodStart: checklistInstances.periodStart, verificationStatus: checklistInstances.verificationStatus })
            .from(checklistInstances).where(inArray(checklistInstances.id, ids.slice(0, 1000)))
            .orderBy(sql`${checklistInstances.periodStart} DESC`).limit(8)
    }
    return { total: ids.length, ...byStatus, sample }
}

export const deleteTestRuns = async (filter: TestRunFilter, expectedCount: number, reason: string, user: AccessTokenPayload) => {
    assertAdmin(user)
    const note = reason.trim()
    if (!note) throw AppError.badRequest("Say why these runs are being deleted.")
    const ids = await matchingRunIds(filter)
    assertWithinCap(ids)
    if (ids.length !== expectedCount) {
        throw AppError.conflict(`The list changed since you checked: ${ids.length} runs match now, not ${expectedCount}. Check again before deleting.`)
    }
    if (!ids.length) return { deleted: 0 }

    const assigneeIds = filter.userIds?.length ? filter.userIds : await assigneesOf(ids)
    await removeRuns(ids)

    await auditService.record({
        entityType: "ChecklistInstance", entityId: "bulk-cleanup", action: "DELETE", actorId: user.sub,
        after: {
            reason: note, deleted: ids.length,
            userIds: filter.userIds ?? [], definitionIds: filter.definitionIds ?? [],
            from: filter.from ?? null, to: filter.to ?? null, runIds: ids.slice(0, 200),
        },
    })
    await dropChecklistSummaries(assigneeIds)
    emitChecklistEvent("checklist-instance:deleted", {}, { count: ids.length })
    return { deleted: ids.length }
}

export const peopleForCleanup = async (filter: Omit<TestRunFilter, "userIds">, user: AccessTokenPayload) => {
    assertAdmin(user)
    if (!filter.definitionIds?.length && !filter.to) return []
    const rows = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        isActive: users.isActive,
        runs: sql<number>`COUNT(DISTINCT ${checklistInstanceAssignees.instanceId})`,
    })
        .from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .where(and(...runConditions(filter)))
        .groupBy(users.id, users.firstName, users.lastName, users.isActive)
        .orderBy(asc(users.firstName))
    return rows.map((r) => ({ id: r.id, name: `${r.firstName}${r.lastName ? ` ${r.lastName}` : ""}`, isActive: r.isActive, runs: Number(r.runs) }))
}

export const runChecklistsForCleanup = async (user: AccessTokenPayload) => {
    assertAdmin(user)
    const rows = await db.select({
        id: checklistInstances.definitionId,
        title: sql<string>`MAX(${checklistInstances.title})`,
        runs: count(),
    })
        .from(checklistInstances)
        .groupBy(checklistInstances.definitionId)
        .orderBy(asc(sql`MAX(${checklistInstances.title})`))
    return rows.map((r) => ({ id: r.id, title: r.title, runs: Number(r.runs) }))
}
