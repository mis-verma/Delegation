import { db } from "../../config/db.js"
import {
    checklistDefinitions,
    checklistDefinitionStores,
    checklistDefinitionAssignees,
    checklistDefinitionReviewers,
    checklistDefinitionItems,
    checklistDefinitionItemAuditUsers,
    users,
    type CHECKLIST_RECURRENCES,
} from "../../db/schema/index.js"
import { eq, and, asc, inArray, notInArray, isNull, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { cached, cacheKey } from "../../config/queryCache.js"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateChecklistDefinitionInput, UpdateChecklistDefinitionInput, SetChecklistDefinitionActiveInput } from "./checklistDefinition.validation.js"
import { generateInstanceForDefinition, loadDefinitionForGeneration } from "../../jobs/checklistInstanceGenerator.job.js"
import { auditService } from "../audit/audit.service.js";
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"

// create/update/setActive/remove all end by broadcasting to every store this definition touches —
// a definition can span several, and the Templates grid / builder open elsewhere need to hear
// about all of them, not just the first.
const emitToStores = (event: string, storeIds: string[], payload: unknown) => {
    for (const storeId of storeIds) emitChecklistEvent(event, { storeId }, payload)
}

// Soft-delete: remove() sets `deletedAt` instead of deleting the row (which used to cascade
// through the entire items/stores/assignees/reviewers/instances tree — see remove()'s own
// comment). Independent of `isActive` (a separate pause/resume switch) — every read path below
// (list/getById/update/setActive/listAllChecklistDefinitions) must AND this in, and so must the
// instance-generation sweep (checklistInstanceGenerator.job.ts).
const NOT_DELETED = isNull(checklistDefinitions.deletedAt)

export type ChecklistRecurrence = (typeof CHECKLIST_RECURRENCES)[number]

export type ListChecklistDefinitionsFilter = {
    storeId?: string
    recurrence?: ChecklistRecurrence
    isActive?: boolean
    page?: number
    limit?: number
}

const DEFINITION_DEFAULT_PAGE_SIZE = 50

// Same shape/reasoning as checklistInstance.service.ts's own paginate/buildMeta — list() used to
// hydrate every matching definition (items, stores, assignees, reviewers) on every call.
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

const statsByDefinition = async (definitionIds: string[]): Promise<Map<string, { completionRate: number | null; qualityRate: number | null }>> => {
    const map = new Map<string, { completionRate: number | null; qualityRate: number | null }>()
    if (!definitionIds.length) return map

    // Unbounded scan over every instance+item this definition has ever generated — unlike
    // checklistInstance.service.ts's near-identical summary() aggregate, this used to recompute on
    // every single list()/getById() call with no caching at all. Same short-TTL posture as
    // summary(): these rates move whenever anyone ticks an item, so there's no clean "just
    // changed" moment to invalidate on, and a fixed key per (sorted) id set means concurrent
    // viewers of the same page/definition share one computation instead of each re-running it.
    const rows = await cached(
        cacheKey("checklist-definition-stats", [...definitionIds].sort().join(",")),
        30,
        async () => {
            // db.execute() on the mysql2 driver resolves to the raw mysql2 tuple [rows, fields],
            // NOT a plain row array — must destructure element 0 (see task.service.ts#complianceReport).
            const [rows] = await db.execute(sql`
                SELECT
                    ci.definitionId AS definitionId,
                    COUNT(*) AS totalItems,
                    SUM(cii.isDone) AS doneItems,
                    SUM(cii.requiredImageCount > 0) AS itemsRequiringPhotos,
                    SUM(
                        CASE WHEN cii.requiredImageCount > 0
                            AND (CASE WHEN cii.requiresLivePhoto THEN COALESCE(img.liveCount, 0) ELSE COALESCE(img.totalCount, 0) END) >= cii.requiredImageCount
                        THEN 1 ELSE 0 END
                    ) AS photoCompliantItems
                FROM ChecklistInstanceItem cii
                JOIN ChecklistInstance ci ON ci.id = cii.instanceId
                LEFT JOIN (
                    SELECT checklistInstanceItemId, COUNT(*) AS totalCount, SUM(captureMethod = 'LIVE') AS liveCount
                    FROM ChecklistInstanceImage GROUP BY checklistInstanceItemId
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
        map.set(r.definitionId as string, {
            completionRate: totalItems ? Math.round((Number(r.doneItems) / totalItems) * 1000) / 10 : null,
            qualityRate: itemsRequiringPhotos ? Math.round((Number(r.photoCompliantItems) / itemsRequiringPhotos) * 1000) / 10 : null,
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
        reviewerIds: reviewerIdsByDefinition.get(definition.id) ?? [],
        items: itemsByDefinition.get(definition.id) ?? [],
        completionRate: stats.get(definition.id)?.completionRate ?? null,
        qualityRate: stats.get(definition.id)?.qualityRate ?? null,
    }))
}

// The client scopes the assignee/auditor pickers to the checklist's own target stores, but that's
// just UI - nothing stopped a POST from naming a userId who belongs to a completely different
// store (or no store at all). A checklist assigned to someone who can never see it in their own
// store's queue isn't "assigned", it's silently lost, so this is enforced again here regardless of
// what the client sent.
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

// Internal, unbounded — for callers that must see every matching definition regardless of page
// size (checklistBulkImport.service.ts's matchRows fuzzy-matches an uploaded row's checklist name
// against every definition that exists; silently only searching the first page would misfile rows
// for any org with more definitions than one page, which is worse than the query cost this
// function exists to avoid). The paginated, HTTP-facing list() below is for the templates grid.
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

export const checklistDefinitionService = {
    async list(filter: ListChecklistDefinitionsFilter) {
        const p = paginateDefinitions(filter.page, filter.limit)
        const conditions = [NOT_DELETED]
        if (filter.recurrence) conditions.push(eq(checklistDefinitions.recurrence, filter.recurrence))
        if (filter.isActive !== undefined) conditions.push(eq(checklistDefinitions.isActive, filter.isActive))
        if (filter.storeId) {
            // Mongo/Mongoose matched an array field against a scalar as "array contains this
            // value" — the equivalent here is a lookup against the junction table first, then
            // filtering the definitions to just those ids.
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

        const definitionId = createId()

        // Wrapped in a transaction (source had none) — creating a definition fans out into
        // four related tables (stores, assignees, items, item auditors); a partial failure
        // half-way through must not leave an orphaned/incomplete definition behind.
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
                createdBy: user.sub,
            })

            await tx.insert(checklistDefinitionStores).values(
                input.storeIds.map(storeId => ({ definitionId, storeId })),
            )
            await tx.insert(checklistDefinitionAssignees).values(
                input.assigneeIds.map(userId => ({ definitionId, userId })),
            )
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
                    itemType: item.itemType ?? "STANDARD",
                    accessories: item.accessories ?? null,
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


        const definitionForGeneration = await loadDefinitionForGeneration(definitionId)
        if (definitionForGeneration) await generateInstanceForDefinition(definitionForGeneration, new Date())

        const created = await this.getById(definitionId)
        await auditService.record({ entityType: "ChecklistDefinition", entityId: definitionId, action: "CREATE", actorId: user.sub, after: created })
        emitToStores("checklist-definition:created", created.storeIds, { definitionId })
        return created
    },

    async update(id: string, input: UpdateChecklistDefinitionInput, actorId: string) {
        await assertUsersBelongToStores(input.assigneeIds, input.storeIds, "assignees")
        for (const item of input.items) {
            if (item.itemType === "AUDIT" && item.auditUserIds?.length) {
                await assertUsersBelongToStores(item.auditUserIds, input.storeIds, "auditors")
            }
        }

        let wasActive = false

        // Captured before the update so a store REMOVED from storeIds still hears that this
        // definition no longer applies to it, not just the (possibly different) stores it ends up
        // targeting afterward.
        const oldStoreLinks = await db.select({ storeId: checklistDefinitionStores.storeId })
            .from(checklistDefinitionStores).where(eq(checklistDefinitionStores.definitionId, id))
        const affectedStoreIds = [...new Set([...oldStoreLinks.map(l => l.storeId), ...input.storeIds])]

        await db.transaction(async (tx) => {
            // Locked (not a plain select) so two concurrent update() calls can't both read the
            // same version and both pass the check below — the second waits for the first's
            // transaction to commit (bumping the version), then genuinely sees the new value.
            const [existing] = await tx
                .select({ id: checklistDefinitions.id, version: checklistDefinitions.version, isActive: checklistDefinitions.isActive })
                .from(checklistDefinitions)
                .where(and(eq(checklistDefinitions.id, id), NOT_DELETED))
                .for("update")
                .limit(1)
            if (!existing) throw AppError.notFound("Checklist not found")
            // Optimistic-concurrency guard: the client sends back whichever version it loaded the
            // checklist at. If someone else has saved a change since, this no longer matches, and
            // a full-replace write here would silently discard their changes with no warning —
            // reject instead and ask the admin to reload and reapply their edit.
            if (existing.version !== input.version) {
                throw AppError.conflict("This checklist was changed by someone else. Refresh the page and reapply your edit.")
            }
            wasActive = existing.isActive

            await tx.update(checklistDefinitions).set({
                name: input.name,
                description: input.description ?? null,
                recurrence: input.recurrence,
                startDate: new Date(input.startDate),
                opensTime: input.opensTime ?? null,
                cutoffTime: input.cutoffTime ?? null,
                assigneeRoles: input.assigneeRoles ?? [],
                icon: input.icon,
                version: existing.version + 1,
                updatedAt: new Date(),
            }).where(eq(checklistDefinitions.id, id))
            await tx.delete(checklistDefinitionStores).where(eq(checklistDefinitionStores.definitionId, id))
            await tx.insert(checklistDefinitionStores).values(
                input.storeIds.map(storeId => ({ definitionId: id, storeId })),
            )
            await tx.delete(checklistDefinitionAssignees).where(eq(checklistDefinitionAssignees.definitionId, id))
            await tx.insert(checklistDefinitionAssignees).values(
                input.assigneeIds.map(userId => ({ definitionId: id, userId })),
            )
            await tx.delete(checklistDefinitionReviewers).where(eq(checklistDefinitionReviewers.definitionId, id))
            if (input.reviewerIds?.length) {
                await tx.insert(checklistDefinitionReviewers).values(
                    input.reviewerIds.map(userId => ({ definitionId: id, userId })),
                )
            }
            const newItemIds: string[] = []
            for (const [index, item] of input.items.entries()) {
                const itemId = createId()
                newItemIds.push(itemId)
                await tx.insert(checklistDefinitionItems).values({
                    id: itemId,
                    label: item.label,
                    order: item.order ?? index,
                    section: item.section ?? null,
                    requiredImageCount: item.requiredImageCount ?? 0,
                    maxImageCount: item.maxImageCount ?? null,
                    requiresLivePhoto: item.requiresLivePhoto ?? false,
                    itemType: item.itemType ?? "STANDARD",
                    accessories: item.accessories ?? null,
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
                    yesActions: item.yesActions ?? null,
                    noActions: item.noActions ?? null,
                    definitionId: id,
                })
                if (item.itemType === "AUDIT" && item.auditUserIds?.length) {
                    await tx.insert(checklistDefinitionItemAuditUsers).values(
                        item.auditUserIds.map(userId => ({ itemId, userId })),
                    )
                }
            }
           
            // Deletes the OLD item rows (every row for this definition NOT among the ones just
            // inserted above) so the fresh insert-then-delete-stale pattern actually replaces the
            // item list. This used to delete `inArray(..., newItemIds)` — the rows just inserted —
            // which discarded every edit silently: the new rows were inserted then immediately
            // deleted in the same transaction, leaving the untouched originals as the "current"
            // items. `notInArray` is what makes stale-row cleanup instead of self-sabotage.
            await tx.delete(checklistDefinitionItems).where(
                newItemIds.length
                    ? and(eq(checklistDefinitionItems.definitionId, id), notInArray(checklistDefinitionItems.id, newItemIds))
                    : eq(checklistDefinitionItems.definitionId, id),
            )
        })

        // Only stamp out a fresh instance if this definition is still active - an admin editing a
        // deactivated checklist (e.g. fixing a label typo) shouldn't silently bring it back to life.
        if (wasActive) {
            const definitionForGeneration = await loadDefinitionForGeneration(id)
            if (definitionForGeneration) await generateInstanceForDefinition(definitionForGeneration, new Date())
        }

        const updated = await this.getById(id)
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: "UPDATE", actorId, after: updated })
        emitToStores("checklist-definition:updated", affectedStoreIds, { definitionId: id })
        return updated
    },

    async setActive(id: string, input: SetChecklistDefinitionActiveInput, actorId: string) {
        const [existing] = await db.select({ id: checklistDefinitions.id }).from(checklistDefinitions).where(and(eq(checklistDefinitions.id, id), NOT_DELETED)).limit(1)
        if (!existing) throw AppError.notFound("Checklist not found")
        await db.update(checklistDefinitions).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(checklistDefinitions.id, id))
        const updated = await this.getById(id)
        // Its own action: deactivating a checklist silently stops instances being generated, which
        // is the kind of change people later swear nobody made.
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: input.isActive ? "ACTIVATE" : "DEACTIVATE", actorId, after: updated })
        emitToStores("checklist-definition:updated", updated.storeIds, { definitionId: id })
        return updated
    },

    // Soft delete: sets deletedAt instead of removing the row. Used to be a single `db.delete()`
    // relying on the Drizzle schema's `onDelete: 'cascade'` chain (definition -> items, stores,
    // assignees, reviewers, and every generated ChecklistInstance -> that instance's own
    // assignees/items -> images/submissions -> submission accessories/images) to clean up every
    // descendant table in one statement. None of that runs now: every item, store, assignee,
    // reviewer, and — most importantly — every historical instance (with its submitted photos and
    // answers) stays exactly as it was, so the checklist's full audit trail survives a "delete."
    // Every read path in this file (list/getById/update/setActive/listAllChecklistDefinitions)
    // hides it from here on via NOT_DELETED, and the instance-generation sweep
    // (checklistInstanceGenerator.job.ts) excludes it too so it never generates another run.
    async remove(id: string, actorId: string) {
        const existing = await this.getById(id).catch(() => null)
        if (!existing) throw AppError.notFound("Checklist not found")
        const deletedAt = new Date()
        await db.update(checklistDefinitions).set({ deletedAt, updatedAt: deletedAt }).where(eq(checklistDefinitions.id, id))
        await auditService.record({ entityType: "ChecklistDefinition", entityId: id, action: "DELETE", actorId, before: existing })
        emitToStores("checklist-definition:deleted", existing.storeIds, { definitionId: id })
        return existing
    },
}
