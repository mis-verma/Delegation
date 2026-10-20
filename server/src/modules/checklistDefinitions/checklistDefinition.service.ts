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
    checklistInstances,
    type CHECKLIST_RECURRENCES,
} from "../../db/schema/index.js"
import { eq, and, asc, count, inArray, notInArray, isNull, isNotNull, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { cached, cacheKey } from "../../config/queryCache.js"
import { env } from "../../config/env.js"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateChecklistDefinitionInput, UpdateChecklistDefinitionInput, SetChecklistDefinitionActiveInput } from "./checklistDefinition.validation.js"
import { clearSummariesForDefinition, dropUntouchedCurrentRunsFor, generateInstanceForDefinition, loadDefinitionForGeneration, syncLiveInstances, type LiveRunsSummary } from "../../jobs/checklistInstanceGenerator.job.js"
import { auditService } from "../audit/audit.service.js";
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { GATED_BOOLEAN_ITEM_EXPR, FLAGGED_BOOLEAN_ANSWER_EXPR } from "../../utils/checklistBooleanFlags.js"

const emitToStores = (event: string, storeIds: string[], payload: unknown) => {
    for (const storeId of storeIds) emitChecklistEvent(event, { storeId }, payload)
}

const NOT_DELETED = isNull(checklistDefinitions.deletedAt)

const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6]

export type ChecklistRecurrence = (typeof CHECKLIST_RECURRENCES)[number]

export type ListChecklistDefinitionsFilter = {
    storeId?: string
    recurrence?: ChecklistRecurrence
    isActive?: boolean
    draft?: boolean
    page?: number
    limit?: number
}

const DEFINITION_DEFAULT_PAGE_SIZE = 50

const paginateDefinitions = (page?: number, limit?: number) => {
    const safePage = Math.max(1, Math.trunc(page ?? 1) || 1)
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit ?? DEFINITION_DEFAULT_PAGE_SIZE) || DEFINITION_DEFAULT_PAGE_SIZE))
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

const buildDefinitionsMeta = (p: { page: number; limit: number }, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.limit)),
    hasNext: p.page * p.limit < total,
})

type DefinitionStats = { completionRate: number | null; qualityRate: number | null; issueRate: number | null; currentRate: number | null }

const statsByDefinition = async (definitionIds: string[]): Promise<Map<string, DefinitionStats>> => {
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
            return rows as unknown as any[]
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

const hydrateDefinitions = async (definitionRows: (typeof checklistDefinitions.$inferSelect)[]) => {
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

    const itemsByDefinition = new Map<string, any[]>()
    for (const item of items) {
        const mapped = { ...item, auditUserIds: auditUserIdsByItem.get(item.id) ?? [] }
        const list = itemsByDefinition.get(item.definitionId) ?? []
        list.push(mapped)
        itemsByDefinition.set(item.definitionId, list)
    }

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

const assertUsersBelongToStores = async (userIds: string[], storeIds: string[], roleLabel: string) => {
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

const closedForToday = (def: { recurrence: string; opensTime: string | null; cutoffTime: string | null }): boolean => {
    if (def.recurrence !== "DAILY" || !def.cutoffTime) return false
    if (def.opensTime && def.cutoffTime < def.opensTime) return false
    const local = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16)
    return local >= def.cutoffTime
}

const countActiveUsers = async (userIds: string[]): Promise<number> => {
    const unique = [...new Set(userIds)]
    if (!unique.length) return 0
    const [row] = await db.select({ total: count() }).from(users).where(and(inArray(users.id, unique), eq(users.isActive, true)))
    return Number(row?.total ?? 0)
}

const assertReviewersValid = async (reviewerIds: string[] | undefined, alreadyLinked: string[] = []) => {
    const fresh = [...new Set(reviewerIds ?? [])].filter((id) => !alreadyLinked.includes(id))
    if (!fresh.length) return
    const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, fresh), eq(users.isActive, true)))
    if (rows.length !== fresh.length) throw AppError.badRequest("Some reviewers don't exist or have left.")
}

type StoredDefinitionItem = Awaited<ReturnType<typeof hydrateDefinitions>>[number]["items"][number]
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

const SCORABLE_TYPES = new Set(["YES_NO", "PASS_FAIL", "MULTIPLE_CHOICE", "DROPDOWN", "NUMBER_ENTRY", "RATING"])
const RANGE_TYPES = new Set(["NUMBER_ENTRY", "RATING"])

const hasGoodAnswerRule = (item: { itemType: string; acceptableAnswers: string[] | null; acceptableMin: number | null; acceptableMax: number | null }) =>
    RANGE_TYPES.has(item.itemType)
        ? item.acceptableMin != null || item.acceptableMax != null
        : (item.acceptableAnswers?.length ?? 0) > 0

const GAP_LABELS_SHOWN = 5

export const checklistDefinitionService = {
    async scoringGaps() {
        const rows = await db
            .select({
                definitionId: checklistDefinitions.id,
                name: checklistDefinitions.name,
                recurrence: checklistDefinitions.recurrence,
                isActive: checklistDefinitions.isActive,
                label: checklistDefinitionItems.label,
                order: checklistDefinitionItems.order,
                itemType: checklistDefinitionItems.itemType,
                acceptableAnswers: checklistDefinitionItems.acceptableAnswers,
                acceptableMin: checklistDefinitionItems.acceptableMin,
                acceptableMax: checklistDefinitionItems.acceptableMax,
            })
            .from(checklistDefinitionItems)
            .innerJoin(checklistDefinitions, eq(checklistDefinitions.id, checklistDefinitionItems.definitionId))
            .where(and(isNull(checklistDefinitions.deletedAt), eq(checklistDefinitions.isActive, true)))
            .orderBy(asc(checklistDefinitions.name), asc(checklistDefinitionItems.order))

        const byDefinition = new Map<string, { id: string; name: string; recurrence: string; scorable: number; unscored: number; labels: string[] }>()
        for (const r of rows) {
            if (!SCORABLE_TYPES.has(r.itemType)) continue
            const entry = byDefinition.get(r.definitionId) ?? { id: r.definitionId, name: r.name, recurrence: r.recurrence, scorable: 0, unscored: 0, labels: [] }
            entry.scorable += 1
            if (!hasGoodAnswerRule(r)) {
                entry.unscored += 1
                if (entry.labels.length < GAP_LABELS_SHOWN) entry.labels.push(r.label)
            }
            byDefinition.set(r.definitionId, entry)
        }
        return [...byDefinition.values()].filter((d) => d.unscored > 0).sort((a, b) => b.unscored - a.unscored || a.name.localeCompare(b.name))
    },

    async list(filter: ListChecklistDefinitionsFilter) {
        const p = paginateDefinitions(filter.page, filter.limit)
        const conditions = [NOT_DELETED]
        if (filter.recurrence) conditions.push(eq(checklistDefinitions.recurrence, filter.recurrence))
        if (filter.isActive !== undefined) conditions.push(eq(checklistDefinitions.isActive, filter.isActive))
        if (filter.draft !== undefined) {
            const noPeople = sql`NOT EXISTS (SELECT 1 FROM ${checklistDefinitionAssignees} a WHERE a.definitionId = ${checklistDefinitions.id})`
            conditions.push(filter.draft ? and(eq(checklistDefinitions.isActive, false), noPeople)! : sql`NOT (${checklistDefinitions.isActive} = 0 AND ${noPeople})`)
        }
        if (filter.storeId) {
            const links = await db
                .select({ definitionId: checklistDefinitionStores.definitionId })
                .from(checklistDefinitionStores)
                .where(eq(checklistDefinitionStores.storeId, filter.storeId))
            if (!links.length) return { data: [], meta: buildDefinitionsMeta(p, 0) }
            conditions.push(inArray(checklistDefinitions.id, links.map(l => l.definitionId)))
        }

        const where = conditions.length ? and(...conditions) : undefined
        const [{ value: total }] = await db.select({ value: sql<number>`COUNT(*)` }).from(checklistDefinitions).where(where)
        const definitionRows = await db.select().from(checklistDefinitions)
            .where(where)
            .orderBy(asc(checklistDefinitions.name))
            .limit(p.limit).offset(p.offset)
        return { data: await hydrateDefinitions(definitionRows), meta: buildDefinitionsMeta(p, Number(total ?? 0)) }
    },

    async getById(id: string) {
        const [definition] = await db.select().from(checklistDefinitions).where(and(eq(checklistDefinitions.id, id), NOT_DELETED)).limit(1)
        if (!definition) throw AppError.notFound("Checklist not found")
        const [hydrated] = await hydrateDefinitions([definition])
        return hydrated
    },

    async create(input: CreateChecklistDefinitionInput, user: AccessTokenPayload) {
        await assertUsersBelongToStores(input.assigneeIds, input.storeIds, "assignees")
        for (const item of input.items) {
            if (item.itemType === "AUDIT" && item.auditUserIds?.length) {
                await assertUsersBelongToStores(item.auditUserIds, input.storeIds, "auditors")
            }
        }

        await assertReviewersValid(input.reviewerIds)
        const hasActivePeople = (await countActiveUsers(input.assigneeIds)) > 0

        const definitionId = createId()

        await db.transaction(async (tx) => {
            await tx.insert(checklistDefinitions).values({
                id: definitionId,
                name: input.name,
                description: input.description ?? null,
                recurrence: input.recurrence,
                startDate: new Date(input.startDate),
                opensTime: input.opensTime ?? null,
                cutoffTime: input.cutoffTime ?? null,
                assigneeRoles: input.assigneeRoles ?? [],
                icon: input.icon,
                responseMode: input.responseMode ?? "SHARED",
                activeWeekdays: input.recurrence === "DAILY" ? (input.activeWeekdays === undefined ? DEFAULT_WORKING_WEEKDAYS : input.activeWeekdays) : null,
                isActive: hasActivePeople,
                createdBy: user.sub,
            })

            await tx.insert(checklistDefinitionStores).values(
                input.storeIds.map(storeId => ({ definitionId, storeId })),
            )
            if (input.assigneeIds.length) {
                await tx.insert(checklistDefinitionAssignees).values(
                    input.assigneeIds.map(userId => ({ definitionId, userId })),
                )
            }
            if (input.reviewerIds?.length) {
                await tx.insert(checklistDefinitionReviewers).values(
                    input.reviewerIds.map(userId => ({ definitionId, userId })),
                )
            }

            for (const [index, item] of input.items.entries()) {
                const itemId = createId()
                await tx.insert(checklistDefinitionItems).values({
                    id: itemId,
                    label: item.label,
                    order: item.order ?? index,
                    section: item.section ?? null,
                    requiredImageCount: item.requiredImageCount ?? 0,
                    maxImageCount: item.maxImageCount ?? null,
                    requiresLivePhoto: item.requiresLivePhoto ?? false,
                    isCritical: item.isCritical ?? false,
                    itemType: item.itemType ?? "STANDARD",
                    accessories: item.accessories ?? null,
                    accessoriesFemale: item.accessoriesFemale ?? null,
                    accessoriesMale: item.accessoriesMale ?? null,
                    accessoriesByType: item.accessoriesByType ?? null,
                    numberEntryUnit: item.numberEntryUnit ?? null,
                    numberEntryMin: item.numberEntryMin ?? null,
                    numberEntryMax: item.numberEntryMax ?? null,
                    ratingScale: item.ratingScale ?? null,
                    options: item.options ?? null,
                    gpsTargetLat: item.gpsTargetLat ?? null,
                    gpsTargetLng: item.gpsTargetLng ?? null,
                    gpsRadiusMeters: item.gpsRadiusMeters ?? null,
                    signatureLabels: item.signatureLabels ?? null,
                    qrExpectedValue: item.qrExpectedValue ?? null,
                    cashExpectedAmount: item.cashExpectedAmount ?? null,
                    acceptableAnswers: item.acceptableAnswers?.length ? item.acceptableAnswers : null,
                    acceptableMin: item.acceptableMin ?? null,
                    acceptableMax: item.acceptableMax ?? null,
                    yesActions: item.yesActions ?? null,
                    noActions: item.noActions ?? null,
                    definitionId,
                })
                if (item.itemType === "AUDIT" && item.auditUserIds?.length) {
                    await tx.insert(checklistDefinitionItemAuditUsers).values(
                        item.auditUserIds.map(userId => ({ itemId, userId })),
                    )
                }
            }
        })

        if (hasActivePeople) {
            try {
                const definitionForGeneration = await loadDefinitionForGeneration(definitionId)
                if (definitionForGeneration) await generateInstanceForDefinition(definitionForGeneration, new Date())
            } catch (err) {
                console.error(`[checklistDefinition.create] saved ${definitionId} but could not generate today's runs`, err)
            }
        }

        const created = await this.getById(definitionId)
        await auditService.record({ entityType: "ChecklistDefinition", entityId: definitionId, action: "CREATE", actorId: user.sub, after: created })
        emitToStores("checklist-definition:created", created.storeIds, { definitionId })
        return created
    },

    async update(id: string, input: UpdateChecklistDefinitionInput, actorId: string) {
        const [current] = await db.select({ version: checklistDefinitions.version }).from(checklistDefinitions).where(and(eq(checklistDefinitions.id, id), NOT_DELETED)).limit(1)
        if (!current) throw AppError.notFound("Checklist not found")
        if (current.version !== input.version) {
            throw AppError.conflict("Someone else saved this checklist while you were editing. Reload it to see their changes, then apply yours again.")
        }
        await assertUsersBelongToStores(input.assigneeIds, input.storeIds, "assignees")
        for (const item of input.items) {
            if (item.itemType === "AUDIT" && item.auditUserIds?.length) {
                await assertUsersBelongToStores(item.auditUserIds, input.storeIds, "auditors")
            }
        }

        let isActiveAfter = false
        let pausedForNoPeople = false
        let wentLive = false
        let lateToday = false
        const activePeopleCount = await countActiveUsers(input.assigneeIds)

        const oldStoreLinks = await db.select({ storeId: checklistDefinitionStores.storeId })
            .from(checklistDefinitionStores).where(eq(checklistDefinitionStores.definitionId, id))
        const affectedStoreIds = [...new Set([...oldStoreLinks.map(l => l.storeId), ...input.storeIds])]
        const oldReviewerLinks = await db.select({ userId: checklistDefinitionReviewers.userId })
            .from(checklistDefinitionReviewers).where(eq(checklistDefinitionReviewers.definitionId, id))
        await assertReviewersValid(input.reviewerIds, oldReviewerLinks.map(l => l.userId))

        await db.transaction(async (tx) => {
            const [existing] = await tx
                .select({ id: checklistDefinitions.id, version: checklistDefinitions.version, isActive: checklistDefinitions.isActive })
                .from(checklistDefinitions)
                .where(and(eq(checklistDefinitions.id, id), NOT_DELETED))
                .for("update")
                .limit(1)
            if (!existing) throw AppError.notFound("Checklist not found")
            if (existing.version !== input.version) {
                throw AppError.conflict("Someone else saved this checklist while you were editing. Reload it to see their changes, then apply yours again.")
            }
            const [{ total: oldAssigneeCount }] = await tx.select({ total: count() }).from(checklistDefinitionAssignees).where(eq(checklistDefinitionAssignees.definitionId, id))
            const nowHasPeople = activePeopleCount > 0
            const nextActive = !nowHasPeople ? false : (!existing.isActive && Number(oldAssigneeCount) === 0) ? true : existing.isActive
            isActiveAfter = nextActive
            wentLive = nextActive && !existing.isActive
            pausedForNoPeople = existing.isActive && !nowHasPeople

            await tx.update(checklistDefinitions).set({
                name: input.name,
                description: input.description ?? null,
                recurrence: input.recurrence,
                startDate: new Date(input.startDate),
                opensTime: input.opensTime ?? null,
                cutoffTime: input.cutoffTime ?? null,
                assigneeRoles: input.assigneeRoles ?? [],
                icon: input.icon,
                ...(input.responseMode ? { responseMode: input.responseMode } : {}),
                ...(input.recurrence !== "DAILY" ? { activeWeekdays: null } : input.activeWeekdays !== undefined ? { activeWeekdays: input.activeWeekdays } : {}),
                isActive: nextActive,
                version: existing.version + 1,
                updatedAt: new Date(),
            }).where(eq(checklistDefinitions.id, id))
            await tx.delete(checklistDefinitionStores).where(eq(checklistDefinitionStores.definitionId, id))
            await tx.insert(checklistDefinitionStores).values(
                input.storeIds.map(storeId => ({ definitionId: id, storeId })),
            )
            await tx.delete(checklistDefinitionAssignees).where(eq(checklistDefinitionAssignees.definitionId, id))
            if (input.assigneeIds.length) {
                await tx.insert(checklistDefinitionAssignees).values(
                    input.assigneeIds.map(userId => ({ definitionId: id, userId })),
                )
            }
            await tx.delete(checklistDefinitionReviewers).where(eq(checklistDefinitionReviewers.definitionId, id))
            if (input.reviewerIds?.length) {
                await tx.insert(checklistDefinitionReviewers).values(
                    input.reviewerIds.map(userId => ({ definitionId: id, userId })),
                )
            }
            const existingItemRows = await tx.select({ id: checklistDefinitionItems.id }).from(checklistDefinitionItems)
                .where(eq(checklistDefinitionItems.definitionId, id))
            const existingItemIds = new Set(existingItemRows.map((r) => r.id))
            const claimedItemIds = new Set<string>()
            const newItemIds: string[] = []
            for (const [index, item] of input.items.entries()) {
                const keepsId = item.id !== undefined && existingItemIds.has(item.id) && !claimedItemIds.has(item.id)
                const itemId = keepsId ? item.id! : createId()
                claimedItemIds.add(itemId)
                newItemIds.push(itemId)
                const itemValues = {
                    label: item.label,
                    order: item.order ?? index,
                    section: item.section ?? null,
                    requiredImageCount: item.requiredImageCount ?? 0,
                    maxImageCount: item.maxImageCount ?? null,
                    requiresLivePhoto: item.requiresLivePhoto ?? false,
                    isCritical: item.isCritical ?? false,
                    itemType: item.itemType ?? "STANDARD",
                    accessories: item.accessories ?? null,
                    accessoriesFemale: item.accessoriesFemale ?? null,
                    accessoriesMale: item.accessoriesMale ?? null,
                    accessoriesByType: item.accessoriesByType ?? null,
                    numberEntryUnit: item.numberEntryUnit ?? null,
                    numberEntryMin: item.numberEntryMin ?? null,
                    numberEntryMax: item.numberEntryMax ?? null,
                    ratingScale: item.ratingScale ?? null,
                    options: item.options ?? null,
                    gpsTargetLat: item.gpsTargetLat ?? null,
                    gpsTargetLng: item.gpsTargetLng ?? null,
                    gpsRadiusMeters: item.gpsRadiusMeters ?? null,
                    signatureLabels: item.signatureLabels ?? null,
                    qrExpectedValue: item.qrExpectedValue ?? null,
                    cashExpectedAmount: item.cashExpectedAmount ?? null,
                    acceptableAnswers: item.acceptableAnswers?.length ? item.acceptableAnswers : null,
                    acceptableMin: item.acceptableMin ?? null,
                    acceptableMax: item.acceptableMax ?? null,
                    yesActions: item.yesActions ?? null,
                    noActions: item.noActions ?? null,
                }
                if (keepsId) {
                    await tx.update(checklistDefinitionItems).set({ ...itemValues, updatedAt: new Date() }).where(eq(checklistDefinitionItems.id, itemId))
                    await tx.delete(checklistDefinitionItemAuditUsers).where(eq(checklistDefinitionItemAuditUsers.itemId, itemId))
                } else {
                    await tx.insert(checklistDefinitionItems).values({ id: itemId, ...itemValues, definitionId: id })
                }
                if (item.itemType === "AUDIT" && item.auditUserIds?.length) {
                    await tx.insert(checklistDefinitionItemAuditUsers).values(
                        item.auditUserIds.map(userId => ({ itemId, userId })),
                    )
                }
            }
           
            await tx.delete(checklistDefinitionItems).where(
                newItemIds.length
                    ? and(eq(checklistDefinitionItems.definitionId, id), notInArray(checklistDefinitionItems.id, newItemIds))
                    : eq(checklistDefinitionItems.definitionId, id),
            )
        })

        let liveRuns: LiveRunsSummary = { refreshed: 0, updated: 0, kept: 0 }
        if (pausedForNoPeople) {
            try {
                await dropUntouchedCurrentRunsFor(id)
            } catch (err) {
                console.error(`[checklistDefinition.update] paused ${id} but could not clear today's runs`, err)
            }
        }
        if (isActiveAfter) {
            try {
                const definitionForGeneration = await loadDefinitionForGeneration(id)
                if (definitionForGeneration) {
                    const now = new Date()
                    liveRuns = await syncLiveInstances(definitionForGeneration, now)
                    await generateInstanceForDefinition(definitionForGeneration, now)
                }
            } catch (err) {
                liveRuns = { refreshed: 0, updated: 0, kept: 0 }
                console.error(`[checklistDefinition.update] saved ${id} but could not refresh today's runs`, err)
            }
        }

        const updated = await this.getById(id)
        lateToday = wentLive && closedForToday(updated)
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: "UPDATE", actorId, after: updated })
        emitToStores("checklist-definition:updated", affectedStoreIds, { definitionId: id })
        return { definition: updated, liveRuns, wentLive, paused: pausedForNoPeople, lateToday }
    },

    async setActive(id: string, input: SetChecklistDefinitionActiveInput, actorId: string) {
        const [existing] = await db.select({ id: checklistDefinitions.id, recurrence: checklistDefinitions.recurrence }).from(checklistDefinitions).where(and(eq(checklistDefinitions.id, id), NOT_DELETED)).limit(1)
        if (!existing) throw AppError.notFound("Checklist not found")
        if (input.isActive && existing.recurrence === "ONE_TIME") {
            const [ran] = await db.select({ total: count() }).from(checklistInstances).where(eq(checklistInstances.definitionId, id))
            if (Number(ran?.total ?? 0) > 0) throw AppError.badRequest("This one-time checklist has already run. Duplicate it to run it again.")
        }
        if (input.isActive) {
            const assigned = await db.select({ userId: checklistDefinitionAssignees.userId }).from(checklistDefinitionAssignees).where(eq(checklistDefinitionAssignees.definitionId, id))
            if ((await countActiveUsers(assigned.map((a) => a.userId))) === 0) throw AppError.badRequest("Nobody active is assigned to fill this checklist in yet. Edit it, add the people, and it goes live by itself.")
        }
        await db.update(checklistDefinitions).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(checklistDefinitions.id, id))
        try {
            if (!input.isActive) {
                await dropUntouchedCurrentRunsFor(id)
            } else {
                const definition = await loadDefinitionForGeneration(id)
                if (definition) await generateInstanceForDefinition(definition, new Date())
                await clearSummariesForDefinition(id)
            }
        } catch (err) {
            console.error(`[checklistDefinition.setActive] ${id} switched, but its current runs were not updated`, err)
        }
        const updated = await this.getById(id)
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: input.isActive ? "ACTIVATE" : "DEACTIVATE", actorId, after: updated })
        emitToStores("checklist-definition:updated", updated.storeIds, { definitionId: id })
        return updated
    },

    async remove(id: string, actorId: string) {
        const existing = await this.getById(id).catch(() => null)
        if (!existing) throw AppError.notFound("Checklist not found")
        const deletedAt = new Date()
        await db.update(checklistDefinitions).set({ deletedAt, updatedAt: deletedAt }).where(eq(checklistDefinitions.id, id))
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: "DELETE", actorId, before: existing })
        emitToStores("checklist-definition:deleted", existing.storeIds, { definitionId: id })
        return existing
    },

    async restore(id: string, actorId: string) {
        const [row] = await db.select({ id: checklistDefinitions.id }).from(checklistDefinitions)
            .where(and(eq(checklistDefinitions.id, id), isNotNull(checklistDefinitions.deletedAt))).limit(1)
        if (!row) throw AppError.notFound("That checklist is not deleted")
        await db.update(checklistDefinitions).set({ deletedAt: null, updatedAt: new Date() }).where(eq(checklistDefinitions.id, id))
        const restored = await this.getById(id)
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: "RESTORE", actorId, after: restored })
        emitToStores("checklist-definition:updated", restored.storeIds, { definitionId: id })
        return restored
    },
}
