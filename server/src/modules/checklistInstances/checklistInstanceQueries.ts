import { db } from "../../config/db.js"
import {
    checklistInstances,
    checklistInstanceAssignees,

    checklistInstanceItems,
    checklistInstanceImages,

    users,

    stores,

    auditLogs,

} from "../../db/schema/index.js"
import { eq, and, inArray, desc, asc, sql, gte, lt, ne, type SQL } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { cached, cacheKey, versionTag } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { env } from "../../config/env.js"
import { runSelect, runGroupBy, runFlagsOf, loadExtraDayAssignees } from "../checklistReports/checklistReport.service.js"
import { orgLocalDate, utcSql, asOrgDay } from "./checklistReportRange.js"
import { loadOffDayRules } from "../scores/offDayRules.js"
import { runCompletionPct } from "../scores/scoreFormulas.js"
import { isAdminOrPc } from "../../utils/roles.js"
import { type InstanceStatusFilter, type ChecklistPendingApprovalRow, hydrateInstances, getPopulatedInstanceById, describeItemChange, parentNotDeletedExpr, paginate, buildMeta, countInstances, isHod, assertCanView, DECISIONS_MAX, DECISION_ACTIONS, type ChecklistDecision, type InstanceRecurrence, type InstanceVerificationStatus, type InstanceListFilter, instanceConditions, pendingApprovalScope, SUMMARY_TTL_SECONDS, CHECKLIST_SUMMARY_PREFIX, summaryOwnerKey, SUMMARY_VERSION_ALL, summaryVersionOf } from "./checklistInstanceShared.js"

export const getMine = async (userId: string, options: {
    status?: InstanceStatusFilter
    page?: number
    limit?: number
    storeId?: string
    recurrence?: InstanceRecurrence
    verificationStatus?: InstanceVerificationStatus
    departmentId?: string
    assigneeIds?: string[]
    includeDeleted?: boolean
    from?: string
    to?: string
    hideEnded?: boolean
} = {}) => {
    const { status, page, limit, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to, hideEnded } = options
    const p = paginate(page, limit)
    const where = instanceConditions({ userId, status, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to, hideEnded })

    const total = await countInstances(where)
    const instanceRows = await db.select().from(checklistInstances)
        .where(where)
        .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
        .limit(p.limit).offset(p.offset)

    return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
}

export const getMyFocus = async (userId: string, options: { hideEnded: boolean }) => {
    const base = { includeDeleted: false, hideEnded: options.hideEnded }
    const [sentBack, overdue, unsent, due, recent] = await Promise.all([
        getMine(userId, { ...base, verificationStatus: "REJECTED", limit: 50 }),
        getMine(userId, { ...base, status: "OVERDUE", limit: 50 }),
        getMine(userId, { ...base, status: "COMPLETED", verificationStatus: "NOT_SUBMITTED", limit: 50 }),
        getMine(userId, { ...base, status: "DUE", limit: 50 }),
        getMine(userId, { ...base, limit: 25 }),
    ])
    const byId = new Map<string, (typeof recent.data)[number]>()
    for (const list of [sentBack, overdue, unsent, due, recent]) for (const row of list.data) byId.set(row.id, row)
    return [...byId.values()]
}

export const listAll = async (filter: InstanceListFilter & { page?: number; limit?: number }) => {
    const p = paginate(filter.page, filter.limit)
    const where = instanceConditions(filter)
    const total = await countInstances(where)
    const instanceRows = await db.select().from(checklistInstances)
        .where(where)
        .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
        .limit(p.limit).offset(p.offset)

    return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
}

export const summary = async (filter: InstanceListFilter) => {
    const today = orgLocalDate(new Date())
    const fromDay = filter.from ? asOrgDay(filter.from) : `${today.slice(0, 8)}01`
    const toDay = filter.to ? asOrgDay(filter.to) : today
    const windowed: InstanceListFilter = { ...filter, from: fromDay, to: toDay }
    const owner = summaryOwnerKey(filter.userId)
    const version = await versionTag(SUMMARY_VERSION_ALL, summaryVersionOf(owner))
    return cached(
        cacheKey(
            CHECKLIST_SUMMARY_PREFIX, owner, `v${version}`, filter.includeDeleted ? "deleted" : "live", filter.hideEnded === false ? "all-ends" : "open-ends",
            filter.storeId, filter.assigneeId, filter.assigneeIds?.join(","), filter.definitionId, filter.status,
            filter.departmentId, filter.recurrence, filter.verificationStatus, fromDay, toDay,
        ),
        SUMMARY_TTL_SECONDS,
        async () => {
            const built = instanceConditions(windowed)
            const now = new Date()
            const offDayRules = await loadOffDayRules(fromDay, toDay)

            const runRows = await db.select(runSelect)
                .from(checklistInstances)
                .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
                .where(built)
                .groupBy(...runGroupBy)
            const assigneesByRun = await loadExtraDayAssignees(runRows, offDayRules)
            const flagCtx = { offDayRules, assigneesByRun, offsetMs: env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000, now: now.getTime() }
            const flags = runRows.map((r) => runFlagsOf(r, flagCtx))
            const counted = flags.filter((f) => !f.skip)
            const completed = counted.filter((f) => f.complete).length
            const missed = counted.filter((f) => !f.complete && f.missed).length
            const onTrack = counted.length - completed - missed
            const dueRuns = completed + missed

            const [fresh] = await db.select({ newToday: sql<number>`SUM(CASE WHEN ${checklistInstances.generatedAt} >= ${utcSql(orgDayStartUtc(now))} THEN 1 ELSE 0 END)` })
                .from(checklistInstances).where(built)

            const [items] = await db.select({
                totalItems: sql<number>`COUNT(*)`,
                doneItems: sql<number>`SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END)`,
            })
                .from(checklistInstanceItems)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                .where(built)

            return {
                total: runRows.length,
                completed,
                pending: missed + onTrack,
                due: onTrack,
                overdue: missed,
                missed,
                dueRuns,
                completionPct: runCompletionPct({ completed, due: dueRuns }),
                notCounted: flags.length - counted.length,
                olderOpen: 0,
                totalItems: Number(items?.totalItems ?? 0),
                doneItems: Number(items?.doneItems ?? 0),
                newToday: Number(fresh?.newToday ?? 0),
                window: { from: fromDay, to: toDay, asOf: now.toISOString() },
            }
        },
    )
}

export const itemHistory = async (id: string, user: AccessTokenPayload) => {
    const instance = await getPopulatedInstanceById(id)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    await assertCanView(instance, user)
    const oversees = isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER" || isHod(user) || instance.reviewerIds.includes(user.sub)
    if (!oversees) throw AppError.forbidden()

    const itemIds = instance.items.map((item) => item.id)
    if (itemIds.length === 0) return []
    const rows = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, "ChecklistInstanceItem"), inArray(auditLogs.entityId, itemIds)))
        .orderBy(asc(auditLogs.createdAt))

    return rows.map((row) => ({
        id: row.id,
        itemId: row.entityId,
        at: row.createdAt,
        actorName: row.actorName ?? "Someone",
        source: row.source,
        summary: describeItemChange(row.action, row.before, row.after),
    }))
}

export const itemPrevious = async (id: string, itemId: string, user: AccessTokenPayload) => {
    const instance = await getPopulatedInstanceById(id)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    await assertCanView(instance, user)
    const oversees = isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER" || isHod(user) || instance.reviewerIds.includes(user.sub)
    if (!oversees) throw AppError.forbidden()

    const current = instance.items.find((item) => item.id === itemId)
    if (!current) throw AppError.notFound("That question isn't on this checklist.")
    if (!current.definitionItemId) return null

    const [previous] = await db
        .select({
            itemId: checklistInstanceItems.id,
            runId: checklistInstances.id,
            periodStart: checklistInstances.periodStart,
        })
        .from(checklistInstanceItems)
        .innerJoin(checklistInstances, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(and(
            eq(checklistInstanceItems.definitionItemId, current.definitionItemId),
            eq(checklistInstances.definitionId, instance.definitionId),
            eq(checklistInstances.storeId, instance.storeId),
            ne(checklistInstances.id, instance.id),
            lt(checklistInstances.periodStart, instance.periodStart),
            eq(checklistInstanceItems.isDone, true),
        ))
        .orderBy(desc(checklistInstances.periodStart))
        .limit(1)
    if (!previous) return null

    const [row] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, previous.itemId)).limit(1)
    if (!row) return null
    const images = await db.select().from(checklistInstanceImages).where(eq(checklistInstanceImages.checklistInstanceItemId, row.id))
    const [who] = row.completedBy ? await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, row.completedBy)).limit(1) : []

    return {
        runId: previous.runId,
        periodStart: previous.periodStart,
        itemType: row.itemType,
        booleanAnswer: row.booleanAnswer,
        textValue: row.textValue,
        numericValue: row.numericValue,
        conditionalReasonValue: row.conditionalReasonValue,
        remarks: row.remarks,
        isNotApplicable: row.isNotApplicable,
        sendBackCount: row.sendBackCount,
        completedAt: row.completedAt,
        completedByName: who ? `${who.firstName}${who.lastName ? ` ${who.lastName}` : ""}` : null,
        images: images.map((img) => ({
            id: img.id,
            url: img.url,
            mimeType: img.mimeType,
            originalFilename: img.originalFilename,
            captureMethod: img.captureMethod,
            purpose: img.purpose,
            createdAt: img.createdAt,
        })),
    }
}

export const getById = async (id: string, user: AccessTokenPayload) => {
    const instance = await getPopulatedInstanceById(id)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    await assertCanView(instance, user)
    return instance
}

export const listPendingVerification = async (user: AccessTokenPayload, page?: number, limit?: number) => {
    const p = paginate(page, limit)
    const conditions: SQL[] = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]

    const scope = await pendingApprovalScope(user)
    if (scope) conditions.push(scope)

    const where = and(...conditions)
    const total = await countInstances(where)
    const instanceRows = await db.select().from(checklistInstances)
        .where(where)
        .orderBy(asc(checklistInstances.updatedAt), asc(checklistInstances.id))
        .limit(p.limit).offset(p.offset)
    return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
}

export const pendingApprovalPreview = async (user: AccessTokenPayload, limit = 8): Promise<{ data: ChecklistPendingApprovalRow[]; meta: { total: number } }> => {
    const conditions: SQL[] = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]
    const scope = await pendingApprovalScope(user)
    if (scope) conditions.push(scope)
    const where = and(...conditions)

    const [total, rows] = await Promise.all([
        countInstances(where),
        db.select({
            id: checklistInstances.id,
            title: checklistInstances.title,
            storeName: stores.name,
            submitterId: checklistInstances.submittedBy,
            submitterFirst: users.firstName,
            submitterLast: users.lastName,
            updatedAt: checklistInstances.updatedAt,
        })
            .from(checklistInstances)
            .leftJoin(stores, eq(checklistInstances.storeId, stores.id))
            .leftJoin(users, eq(checklistInstances.submittedBy, users.id))
            .where(where)
            .orderBy(asc(checklistInstances.updatedAt))
            .limit(limit),
    ])

    return {
        data: rows.map((r) => ({
            id: r.id,
            title: r.title,
            storeName: r.storeName ?? null,
            submittedById: r.submitterId ?? null,
            submittedBy: r.submitterFirst ? `${r.submitterFirst}${r.submitterLast ? ` ${r.submitterLast}` : ""}` : null,
            waitingSince: r.updatedAt.toISOString(),
        })),
        meta: { total },
    }
}

export const decisions = async (user: AccessTokenPayload, query: { from?: string; to?: string; limit?: number } = {}): Promise<ChecklistDecision[]> => {
    const orgWide = isAdminOrPc(user.role)
    if (!orgWide && (!isHod(user) || !user.departmentId)) return []

    const limit = Math.min(DECISIONS_MAX, Math.max(1, Math.trunc(query.limit ?? DECISIONS_MAX) || DECISIONS_MAX))
    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
    const dayStart = (v: string) => Date.parse(`${v}T00:00:00.000Z`) - offsetMs
    const fromMs = query.from ? (isDay(query.from) ? dayStart(query.from) : Date.parse(query.from)) : dayStart(orgLocalDate(Date.now()))
    const toMs = query.to ? (isDay(query.to) ? dayStart(query.to) + 86_400_000 : Date.parse(query.to)) : null
    if (Number.isNaN(fromMs) || (toMs !== null && Number.isNaN(toMs))) throw AppError.badRequest("Use an ISO date or datetime.")

    const conditions = [
        eq(auditLogs.entityType, "ChecklistInstance"),
        inArray(auditLogs.action, [...DECISION_ACTIONS]),
        gte(auditLogs.createdAt, new Date(fromMs)),
        parentNotDeletedExpr,
    ]
    if (toMs !== null) conditions.push(lt(auditLogs.createdAt, new Date(toMs)))
    if (!orgWide) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} a
            JOIN ${users} u ON u.id = a.userId
            WHERE a.instanceId = ${checklistInstances.id} AND u.departmentId = ${user.departmentId!}
        )`)
    }

    const rows = await db.select({
        id: auditLogs.id,
        instanceId: checklistInstances.id,
        title: checklistInstances.title,
        storeName: stores.name,
        action: auditLogs.action,
        at: auditLogs.createdAt,
        actorName: auditLogs.actorName,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
        after: auditLogs.after,
    })
        .from(auditLogs)
        .innerJoin(checklistInstances, eq(checklistInstances.id, auditLogs.entityId))
        .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)

    return rows.map((r) => {
        let after: unknown = r.after
        if (typeof after === "string") {
            try { after = JSON.parse(after) } catch { after = null }
        }
        const a = (after && typeof after === "object" ? after : {}) as { note?: unknown; verificationNote?: unknown; sentBackItemIds?: unknown }
        const rawNote = r.action === "SEND_BACK" ? a.note : r.action === "SUBMIT" ? null : a.verificationNote
        const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : null
        return {
            id: r.id,
            instanceId: r.instanceId,
            title: r.title,
            storeName: r.storeName ?? null,
            action: r.action as ChecklistDecision["action"],
            at: r.at.toISOString(),
            actorName: r.actorName ?? (r.actorFirstName ? `${r.actorFirstName}${r.actorLastName ? ` ${r.actorLastName}` : ""}` : "Unknown"),
            note,
            itemCount: r.action === "SEND_BACK" && Array.isArray(a.sentBackItemIds) ? a.sentBackItemIds.length : null,
        }
    })
}
