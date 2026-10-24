import { db } from "../../config/db.js"
import {
    checklistDefinitions,
    checklistDefinitionStores,
    checklistDefinitionAssignees,
    checklistDefinitionReviewers,
    checklistDefinitionItems,
    checklistDefinitionItemAuditUsers,

    checklistInstances,

} from "../../db/schema/index.js"
import { eq, and, asc, count, inArray, notInArray, isNull, isNotNull, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateChecklistDefinitionInput, UpdateChecklistDefinitionInput, SetChecklistDefinitionActiveInput } from "./checklistDefinition.validation.js"
import { clearSummariesForDefinition, dropUntouchedCurrentRunsFor, generateInstanceForDefinition, loadDefinitionForGeneration, syncLiveInstances, type LiveRunsSummary } from "../../jobs/checklistInstanceGenerator.job.js"
import { auditService } from "../audit/audit.service.js";
import { emitToStores, NOT_DELETED, DEFAULT_WORKING_WEEKDAYS, type ListChecklistDefinitionsFilter, paginateDefinitions, buildDefinitionsMeta, hydrateDefinitions, assertUsersBelongToStores, closedForToday, countActiveUsers, assertReviewersValid } from "./checklistDefinitionSupport.js"

const SCORABLE_TYPES = new Set(["YES_NO", "PASS_FAIL", "MULTIPLE_CHOICE", "DROPDOWN", "NUMBER_ENTRY", "RATING"])
const RANGE_TYPES = new Set(["NUMBER_ENTRY", "RATING"])

const hasGoodAnswerRule = (item: { itemType: string; acceptableAnswers: string[] | null; acceptableMin: number | null; acceptableMax: number | null }) =>
    RANGE_TYPES.has(item.itemType)
        ? item.acceptableMin != null || item.acceptableMax != null
        : (item.acceptableAnswers?.length ?? 0) > 0

const GAP_LABELS_SHOWN = 5

export { listAllChecklistDefinitions, toItemInput } from "./checklistDefinitionSupport.js"
export type { ChecklistRecurrence, ListChecklistDefinitionsFilter } from "./checklistDefinitionSupport.js"

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
        const [{ value: total } = { value: 0 }] = await db.select({ value: sql<number>`COUNT(*)` }).from(checklistDefinitions).where(where)
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
        if (!hydrated) throw AppError.notFound("Checklist not found")
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
                lateUntilTime: input.lateUntilTime ?? null,
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
            const [{ total: oldAssigneeCount } = { total: 0 }] = await tx.select({ total: count() }).from(checklistDefinitionAssignees).where(eq(checklistDefinitionAssignees.definitionId, id))
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
                lateUntilTime: input.lateUntilTime ?? null,
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
