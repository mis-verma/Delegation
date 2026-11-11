import { and, eq, gte, inArray, lt, notInArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstances, checklistInstanceAssignees, notifications } from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { auditService } from "../audit/audit.service.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { dropChecklistSummaries } from "./checklistInstanceShared.js"

const BATCH = 200
export const MAX_TEST_RUNS = 5000

const assertAdmin = (user: AccessTokenPayload) => {
    if (user.role !== "ADMIN") throw AppError.forbidden("Only an admin can delete checklist runs.")
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
    const assigneeIds = (await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))).map((r) => r.userId)

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

export type TestRunFilter = { userIds: string[]; from?: Date; to?: Date }

const matchingRunIds = async (filter: TestRunFilter): Promise<string[]> => {
    const people = [...new Set(filter.userIds)]
    if (!people.length) return []
    const linked = await db.selectDistinct({ id: checklistInstanceAssignees.instanceId })
        .from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .where(and(
            inArray(checklistInstanceAssignees.userId, people),
            filter.from ? gte(checklistInstances.periodStart, filter.from) : undefined,
            filter.to ? lt(checklistInstances.periodStart, filter.to) : undefined,
        ))
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

export const previewTestRuns = async (filter: TestRunFilter, user: AccessTokenPayload) => {
    assertAdmin(user)
    const ids = await matchingRunIds(filter)
    if (ids.length > MAX_TEST_RUNS) throw AppError.badRequest(`More than ${MAX_TEST_RUNS} runs match. Pick a shorter date range.`)
    const rows = ids.length
        ? await db.select({ id: checklistInstances.id, title: checklistInstances.title, periodStart: checklistInstances.periodStart, verificationStatus: checklistInstances.verificationStatus })
            .from(checklistInstances).where(inArray(checklistInstances.id, ids.slice(0, 500)))
        : []
    const byStatus = { notSubmitted: 0, pending: 0, approved: 0 }
    if (ids.length) {
        const all = await db.select({ status: checklistInstances.verificationStatus }).from(checklistInstances).where(inArray(checklistInstances.id, ids))
        for (const r of all) {
            if (r.status === "APPROVED") byStatus.approved += 1
            else if (r.status === "PENDING_APPROVAL") byStatus.pending += 1
            else byStatus.notSubmitted += 1
        }
    }
    const sample = rows.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime()).slice(0, 8)
    return { total: ids.length, ...byStatus, sample }
}

export const deleteTestRuns = async (filter: TestRunFilter, expectedCount: number, reason: string, user: AccessTokenPayload) => {
    assertAdmin(user)
    const note = reason.trim()
    if (!note) throw AppError.badRequest("Say why these runs are being deleted.")
    const ids = await matchingRunIds(filter)
    if (ids.length > MAX_TEST_RUNS) throw AppError.badRequest(`More than ${MAX_TEST_RUNS} runs match. Pick a shorter date range.`)
    if (ids.length !== expectedCount) {
        throw AppError.conflict(`The list changed since you checked: ${ids.length} runs match now, not ${expectedCount}. Check again before deleting.`)
    }
    if (!ids.length) return { deleted: 0 }

    await removeRuns(ids)

    await auditService.record({
        entityType: "ChecklistInstance", entityId: "test-cleanup", action: "DELETE", actorId: user.sub,
        after: { reason: note, deleted: ids.length, userIds: filter.userIds, from: filter.from ?? null, to: filter.to ?? null, runIds: ids.slice(0, 200) },
    })
    await dropChecklistSummaries(filter.userIds)
    emitChecklistEvent("checklist-instance:deleted", {}, { count: ids.length })
    return { deleted: ids.length }
}
