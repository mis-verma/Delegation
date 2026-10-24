import { groupBy } from "../../utils/groupBy.js"
import { asRows } from "../../utils/dbErrors.js"
import { db } from "../../config/db.js"
import {
    checklistDefinitions,
    checklistDefinitionStores,
    checklistDefinitionAssignees,
    checklistDefinitionReviewers,
    checklistDefinitionItems,
    checklistDefinitionItemAuditUsers,
    users,
    departments,
    type CHECKLIST_RECURRENCES,
} from "../../db/schema/index.js"
import { eq, and, asc, count, inArray, isNull, sql } from "drizzle-orm"
import { cached, cacheKey } from "../../config/queryCache.js"
import { env } from "../../config/env.js"
import { AppError } from "../../utils/AppError.js"
import type { UpdateChecklistDefinitionInput } from "./checklistDefinition.validation.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { GATED_BOOLEAN_ITEM_EXPR, FLAGGED_BOOLEAN_ANSWER_EXPR } from "../../utils/checklistBooleanFlags.js"

export const emitToStores = (event: string, storeIds: string[], payload: unknown) => {
    for (const storeId of storeIds) emitChecklistEvent(event, { storeId }, payload)
}

export const NOT_DELETED = isNull(checklistDefinitions.deletedAt)

export const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6]

export type ChecklistRecurrence = (typeof CHECKLIST_RECURRENCES)[number]

export type ListChecklistDefinitionsFilter = {
    storeId?: string
    recurrence?: ChecklistRecurrence
    isActive?: boolean
    draft?: boolean
    page?: number
    limit?: number
}

export const DEFINITION_DEFAULT_PAGE_SIZE = 50

export const paginateDefinitions = (page?: number, limit?: number) => {
    const safePage = Math.max(1, Math.trunc(page ?? 1) || 1)
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit ?? DEFINITION_DEFAULT_PAGE_SIZE) || DEFINITION_DEFAULT_PAGE_SIZE))
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

export const buildDefinitionsMeta = (p: { page: number; limit: number }, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.limit)),
    hasNext: p.page * p.limit < total,
})

export type DefinitionStats = { completionRate: number | null; qualityRate: number | null; issueRate: number | null; currentRate: number | null }

export const statsByDefinition = async (definitionIds: string[]): Promise<Map<string, DefinitionStats>> => {
    const map = new Map<string, DefinitionStats>()
    if (!definitionIds.length) return map

    const localNow = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    const rows = await cached(
        cacheKey("checklist-definition-stats", [...definitionIds].sort().join(",")),
        30,
        async () => {
            const [rows] = await db.execute(sql`
                SELECT
                    ci.definitionId AS definitionId,
                    COUNT(*) AS totalItems,
                    SUM(cii.isDone) AS doneItems,
                    SUM(CASE WHEN ci.periodStart <= ${localNow} AND ci.periodEnd >= ${localNow} THEN 1 ELSE 0 END) AS currentItems,
                    SUM(CASE WHEN ci.periodStart <= ${localNow} AND ci.periodEnd >= ${localNow} THEN cii.isDone ELSE 0 END) AS currentDone,
                    SUM(cii.requiredImageCount > 0) AS itemsRequiringPhotos,
                    SUM(
                        CASE WHEN cii.requiredImageCount > 0
                            AND (CASE WHEN cii.requiresLivePhoto THEN COALESCE(img.liveCount, 0) ELSE COALESCE(img.totalCount, 0) END) >= cii.requiredImageCount
                        THEN 1 ELSE 0 END
                    ) AS photoCompliantItems,
                    SUM(CASE WHEN ${GATED_BOOLEAN_ITEM_EXPR} THEN 1 ELSE 0 END) AS gatedBooleanItems,
                    SUM(CASE WHEN ${FLAGGED_BOOLEAN_ANSWER_EXPR} THEN 1 ELSE 0 END) AS flaggedItems
                FROM ChecklistInstanceItem cii
                JOIN ChecklistInstance ci ON ci.id = cii.instanceId
                LEFT JOIN (
                    SELECT checklistInstanceItemId, COUNT(*) AS totalCount, SUM(captureMethod = 'LIVE') AS liveCount
                    FROM ChecklistInstanceImage WHERE purpose = 'GENERAL' GROUP BY checklistInstanceItemId
                ) img ON img.checklistInstanceItemId = cii.id
                WHERE ci.definitionId IN (${sql.join(definitionIds.map((id) => sql`${id}`), sql`, `)})
                GROUP BY ci.definitionId
            `)
            return asRows(rows)
        },
    )

    for (const r of rows) {
        const totalItems = Number(r.totalItems)
        const itemsRequiringPhotos = Number(r.itemsRequiringPhotos)
        const gatedBooleanItems = Number(r.gatedBooleanItems)
        const currentItems = Number(r.currentItems)
        map.set(r.definitionId as string, {
            currentRate: currentItems ? Math.round((Number(r.currentDone) / currentItems) * 100) : null,
            completionRate: totalItems ? Math.round((Number(r.doneItems) / totalItems) * 1000) / 10 : null,
            qualityRate: itemsRequiringPhotos ? Math.round((Number(r.photoCompliantItems) / itemsRequiringPhotos) * 1000) / 10 : null,
            issueRate: gatedBooleanItems ? Math.round((Number(r.flaggedItems) / gatedBooleanItems) * 1000) / 10 : null,
        })
    }
    return map
}

export const hydrateDefinitions = async (definitionRows: (typeof checklistDefinitions.$inferSelect)[]) => {
    if (!definitionRows.length) return []
    const definitionIds = definitionRows.map((d) => d.id)
    const stats = await statsByDefinition(definitionIds)

    const storeLinks = await db.select().from(checklistDefinitionStores).where(inArray(checklistDefinitionStores.definitionId, definitionIds))
    const storeIdsByDefinition = new Map<string, string[]>()
    for (const link of storeLinks) {
        const list = storeIdsByDefinition.get(link.definitionId) ?? []
        list.push(link.storeId)
        storeIdsByDefinition.set(link.definitionId, list)
    }

    const assigneeLinks = await db.select().from(checklistDefinitionAssignees).where(inArray(checklistDefinitionAssignees.definitionId, definitionIds))
    const assigneeIdsByDefinition = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByDefinition.get(link.definitionId) ?? []
        list.push(link.userId)
        assigneeIdsByDefinition.set(link.definitionId, list)
    }

    const assigneeIdList = [...new Set(assigneeLinks.map((l) => l.userId))]
    const assigneeDepartments = assigneeIdList.length
        ? await db.select({ userId: users.id, departmentName: departments.name })
            .from(users)
            .innerJoin(departments, eq(departments.id, users.departmentId))
            .where(inArray(users.id, assigneeIdList))
        : []
    const departmentByUser = new Map(assigneeDepartments.map((r) => [r.userId, r.departmentName]))

    const reviewerLinks = await db.select().from(checklistDefinitionReviewers).where(inArray(checklistDefinitionReviewers.definitionId, definitionIds))
    const reviewerIdsByDefinition = new Map<string, string[]>()
    for (const link of reviewerLinks) {
        const list = reviewerIdsByDefinition.get(link.definitionId) ?? []
        list.push(link.userId)
        reviewerIdsByDefinition.set(link.definitionId, list)
    }

    const items = await db.select().from(checklistDefinitionItems).where(inArray(checklistDefinitionItems.definitionId, definitionIds)).orderBy(asc(checklistDefinitionItems.order))
    const itemIds = items.map((i) => i.id)
    const auditUserLinks = itemIds.length ? await db.select().from(checklistDefinitionItemAuditUsers).where(inArray(checklistDefinitionItemAuditUsers.itemId, itemIds)) : []
    const auditUserIdsByItem = new Map<string, string[]>()
    for (const link of auditUserLinks) {
        const list = auditUserIdsByItem.get(link.itemId) ?? []
        list.push(link.userId)
        auditUserIdsByItem.set(link.itemId, list)
    }

    const itemsByDefinition = groupBy(
        items.map((item) => ({ ...item, auditUserIds: auditUserIdsByItem.get(item.id) ?? [] })),
        (item) => item.definitionId,
    )

    return definitionRows.map((definition) => ({
        ...definition,
        storeIds: storeIdsByDefinition.get(definition.id) ?? [],
        assigneeIds: assigneeIdsByDefinition.get(definition.id) ?? [],
        departmentNames: [...new Set((assigneeIdsByDefinition.get(definition.id) ?? []).map((id) => departmentByUser.get(id)).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b)),
        reviewerIds: reviewerIdsByDefinition.get(definition.id) ?? [],
        items: itemsByDefinition.get(definition.id) ?? [],
        currentRate: stats.get(definition.id)?.currentRate ?? null,
        completionRate: stats.get(definition.id)?.completionRate ?? null,
        qualityRate: stats.get(definition.id)?.qualityRate ?? null,
        issueRate: stats.get(definition.id)?.issueRate ?? null,
    }))
}

export const assertUsersBelongToStores = async (userIds: string[], storeIds: string[], roleLabel: string) => {
    if (!userIds.length) return
    const uniqueIds = [...new Set(userIds)]
    const rows = await db.select({ id: users.id, storeId: users.storeId, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, uniqueIds))

    const foundIds = new Set(rows.map((r) => r.id))
    const missing = uniqueIds.filter((id) => !foundIds.has(id))
    if (missing.length) throw AppError.badRequest(`Unknown ${roleLabel} id(s): ${missing.join(", ")}`)

    const storeSet = new Set(storeIds)
    const outOfScope = rows.filter((r) => !r.storeId || !storeSet.has(r.storeId))
    if (outOfScope.length) {
        const names = outOfScope.map((r) => `${r.firstName} ${r.lastName ?? ""}`.trim()).join(", ")
        throw AppError.badRequest(`These ${roleLabel} don't belong to any of the selected stores: ${names}`)
    }
}

export const closedForToday = (def: { recurrence: string; opensTime: string | null; cutoffTime: string | null }): boolean => {
    if (def.recurrence !== "DAILY" || !def.cutoffTime) return false
    if (def.opensTime && def.cutoffTime < def.opensTime) return false
    const local = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16)
    return local >= def.cutoffTime
}

export const countActiveUsers = async (userIds: string[]): Promise<number> => {
    const unique = [...new Set(userIds)]
    if (!unique.length) return 0
    const [row] = await db.select({ total: count() }).from(users).where(and(inArray(users.id, unique), eq(users.isActive, true)))
    return Number(row?.total ?? 0)
}

export const assertReviewersValid = async (reviewerIds: string[] | undefined, alreadyLinked: string[] = []) => {
    const fresh = [...new Set(reviewerIds ?? [])].filter((id) => !alreadyLinked.includes(id))
    if (!fresh.length) return
    const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, fresh), eq(users.isActive, true)))
    if (rows.length !== fresh.length) throw AppError.badRequest("Some reviewers don't exist or have left.")
}

export type StoredDefinitionItem = Awaited<ReturnType<typeof hydrateDefinitions>>[number]["items"][number]
export const toItemInput = (item: StoredDefinitionItem): UpdateChecklistDefinitionInput["items"][number] => {
    const { createdAt: _createdAt, updatedAt: _updatedAt, definitionId: _definitionId, ...columns } = item
    return {
        ...columns,
        accessories: item.accessories ?? undefined,
        accessoriesFemale: item.accessoriesFemale ?? undefined,
        accessoriesMale: item.accessoriesMale ?? undefined,
        accessoriesByType: item.accessoriesByType ?? undefined,
        options: item.options ?? undefined,
        signatureLabels: item.signatureLabels ?? undefined,
        yesActions: item.yesActions ?? undefined,
        noActions: item.noActions ?? undefined,
    }
}

export const listAllChecklistDefinitions = async (filter: Pick<ListChecklistDefinitionsFilter, "storeId" | "recurrence" | "isActive"> = {}) => {
    const conditions = [NOT_DELETED]
    if (filter.recurrence) conditions.push(eq(checklistDefinitions.recurrence, filter.recurrence))
    if (filter.isActive !== undefined) conditions.push(eq(checklistDefinitions.isActive, filter.isActive))
    if (filter.storeId) {
        const links = await db
            .select({ definitionId: checklistDefinitionStores.definitionId })
            .from(checklistDefinitionStores)
            .where(eq(checklistDefinitionStores.storeId, filter.storeId))
        if (!links.length) return []
        conditions.push(inArray(checklistDefinitions.id, links.map(l => l.definitionId)))
    }

    const definitionRows = await db.select().from(checklistDefinitions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(checklistDefinitions.name))
    return hydrateDefinitions(definitionRows)
}

