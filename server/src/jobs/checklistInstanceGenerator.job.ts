import { scheduleJob } from '../utils/jobTracker.js';
import { isDuplicateEntryError } from '../utils/dbErrors.js';
import { createId } from "@paralleldrive/cuid2"
import { eq, and, inArray, asc, lte, gt, isNull, sql } from "drizzle-orm"
import { db } from "../config/db.js"
import {
    checklistDefinitions,
    checklistDefinitionStores,
    checklistDefinitionAssignees,
    checklistDefinitionReviewers,
    checklistDefinitionItems,
    checklistDefinitionItemAuditUsers,
    checklistInstances,
    checklistInstanceAssignees,
    checklistInstanceReviewers,
    checklistInstanceItems,
    checklistInstanceImages,
    checklistInstanceItemSubmissions,
    checklistInstanceItemSubmissionAccessories,
    checklistInstanceItemSubmissionImages,
    users,
    holidays,
    extraWorkingDays,
    departments,
    stores,
} from "../db/schema/index.js"
import { effectiveWeekOff } from "../modules/users/orgWeekOff.js"
import type { ChecklistRecurrence, ChecklistResponseMode } from "../db/schema/checklistDefinition.js"
import type { Gender } from "../db/schema/core.js"
import { getCurrentPeriod, getUpcomingPeriod, type Period } from "../utils/period.js"
import { env } from "../config/env.js"
import { emitChecklistEvent } from "../sockets/checklistEvent.js"
import { syncVerificationStatus, dropChecklistSummaries, deadlineExpr, localNowExpr } from "../modules/checklistInstances/checklistInstance.service.js"

const timeWindowFor = (recurrence: ChecklistRecurrence, opensTime: string | null, cutoffTime: string | null, lateUntilTime: string | null) =>
    recurrence === "DAILY" || recurrence === "ONE_TIME" ? { opensTime, cutoffTime, lateUntilTime } : { opensTime: null, cutoffTime: null, lateUntilTime: null }

const GENERATOR_BATCH_SIZE = 500;

type GenerationItem = {
    id: string
    label: string
    order: number
    section: string | null
    requiredImageCount: number
    maxImageCount: number | null
    requiresLivePhoto: boolean
    isCritical: boolean
    itemType: (typeof checklistDefinitionItems.$inferSelect)["itemType"]
    accessories: string[] | null
    accessoriesFemale: string[] | null
    accessoriesMale: string[] | null
    accessoriesByType: Record<string, string[]> | null
    numberEntryUnit: string | null
    numberEntryMin: number | null
    numberEntryMax: number | null
    ratingScale: number | null
    options: string[] | null
    gpsTargetLat: number | null
    gpsTargetLng: number | null
    gpsRadiusMeters: number | null
    signatureLabels: string[] | null
    qrExpectedValue: string | null
    cashExpectedAmount: number | null
    acceptableAnswers: string[] | null
    acceptableMin: number | null
    acceptableMax: number | null
    yesActions: (typeof checklistDefinitionItems.$inferSelect)["yesActions"]
    noActions: (typeof checklistDefinitionItems.$inferSelect)["noActions"]
    auditUserIds: string[]
}

export type GenerationDefinition = {
    id: string
    name: string
    recurrence: ChecklistRecurrence
    startDate: Date
    opensTime: string | null
    cutoffTime: string | null
    lateUntilTime: string | null
    activeWeekdays: number[] | null
    responseMode: ChecklistResponseMode
    storeIds: string[]
    assigneeIds: string[]
    reviewerIds: string[]
    items: GenerationItem[]
}

export const loadDefinitionForGeneration = async (definitionId: string): Promise<GenerationDefinition | null> =>
    (await loadDefinitionsForGeneration([definitionId])).get(definitionId) ?? null

export const loadDefinitionsForGeneration = async (definitionIds: string[]): Promise<Map<string, GenerationDefinition>> => {
    const result = new Map<string, GenerationDefinition>()
    if (!definitionIds.length) return result

    const rows = await db.select().from(checklistDefinitions).where(and(inArray(checklistDefinitions.id, definitionIds), isNull(checklistDefinitions.deletedAt)))
    const storeLinks = await db.select({ definitionId: checklistDefinitionStores.definitionId, storeId: checklistDefinitionStores.storeId })
        .from(checklistDefinitionStores)
        .where(inArray(checklistDefinitionStores.definitionId, definitionIds))
    const assigneeLinks = await db.select({ definitionId: checklistDefinitionAssignees.definitionId, userId: checklistDefinitionAssignees.userId })
        .from(checklistDefinitionAssignees)
        .innerJoin(users, eq(users.id, checklistDefinitionAssignees.userId))
        .where(and(inArray(checklistDefinitionAssignees.definitionId, definitionIds), eq(users.isActive, true)))
    const reviewerLinks = await db.select({ definitionId: checklistDefinitionReviewers.definitionId, userId: checklistDefinitionReviewers.userId })
        .from(checklistDefinitionReviewers)
        .innerJoin(users, eq(users.id, checklistDefinitionReviewers.userId))
        .where(and(inArray(checklistDefinitionReviewers.definitionId, definitionIds), eq(users.isActive, true)))

    const itemRows = await db.select().from(checklistDefinitionItems)
        .where(inArray(checklistDefinitionItems.definitionId, definitionIds))
        .orderBy(asc(checklistDefinitionItems.order))
    const itemIds = itemRows.map((i) => i.id)
    const auditLinks = itemIds.length
        ? await db.select().from(checklistDefinitionItemAuditUsers).where(inArray(checklistDefinitionItemAuditUsers.itemId, itemIds))
        : []
    const auditUserIdsByItem = new Map<string, string[]>()
    for (const link of auditLinks) {
        const list = auditUserIdsByItem.get(link.itemId) ?? []
        list.push(link.userId)
        auditUserIdsByItem.set(link.itemId, list)
    }

    const groupBy = <T,>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
        const map = new Map<string, T[]>()
        for (const row of rows) {
            const list = map.get(key(row)) ?? []
            list.push(row)
            map.set(key(row), list)
        }
        return map
    }
    const storesByDef = groupBy(storeLinks, (l) => l.definitionId)
    const assigneesByDef = groupBy(assigneeLinks, (l) => l.definitionId)
    const reviewersByDef = groupBy(reviewerLinks, (l) => l.definitionId)
    const itemsByDef = groupBy(itemRows, (i) => i.definitionId)

    for (const row of rows) {
        result.set(row.id, {
            id: row.id,
            name: row.name,
            recurrence: row.recurrence,
            startDate: row.startDate,
            opensTime: row.opensTime,
            cutoffTime: row.cutoffTime,
            lateUntilTime: row.lateUntilTime,
            activeWeekdays: row.activeWeekdays ?? null,
            responseMode: row.responseMode,
            storeIds: (storesByDef.get(row.id) ?? []).map((l) => l.storeId),
            assigneeIds: (assigneesByDef.get(row.id) ?? []).map((l) => l.userId),
            reviewerIds: (reviewersByDef.get(row.id) ?? []).map((l) => l.userId),
            items: (itemsByDef.get(row.id) ?? []).map((item) => ({ ...item, auditUserIds: auditUserIdsByItem.get(item.id) ?? [] })),
        })
    }
    return result
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const stampPeople = async (tx: Tx, instanceId: string, definition: GenerationDefinition) => {
    if (definition.assigneeIds.length) {
        await tx.insert(checklistInstanceAssignees).values(
            definition.assigneeIds.map((userId) => ({ instanceId, userId })),
        )
    }
    if (definition.reviewerIds.length) {
        await tx.insert(checklistInstanceReviewers).values(
            definition.reviewerIds.map((userId) => ({ instanceId, userId })),
        )
    }
}

export const defaultAcceptableAnswers = (item: Pick<GenerationItem, "itemType" | "acceptableAnswers">): string[] | null =>
    item.acceptableAnswers?.length ? item.acceptableAnswers : item.itemType === "YES_NO" || item.itemType === "PASS_FAIL" ? ["YES"] : item.acceptableAnswers

const definitionConfig = (item: GenerationItem) => ({
    requiredImageCount: item.requiredImageCount,
    maxImageCount: item.maxImageCount,
    requiresLivePhoto: item.requiresLivePhoto,
    isCritical: item.isCritical,
    accessories: item.accessories ?? [],
    numberEntryUnit: item.numberEntryUnit,
    numberEntryMin: item.numberEntryMin,
    numberEntryMax: item.numberEntryMax,
    ratingScale: item.ratingScale,
    options: item.options,
    gpsTargetLat: item.gpsTargetLat,
    gpsTargetLng: item.gpsTargetLng,
    gpsRadiusMeters: item.gpsRadiusMeters,
    signatureLabels: item.signatureLabels,
    qrExpectedValue: item.qrExpectedValue,
    cashExpectedAmount: item.cashExpectedAmount,
    acceptableAnswers: defaultAcceptableAnswers(item),
    acceptableMin: item.acceptableMin,
    acceptableMax: item.acceptableMax,
    yesActions: item.yesActions,
    noActions: item.noActions,
})

export const accessoriesForPerson = (
    item: Pick<GenerationItem, "accessories" | "accessoriesFemale" | "accessoriesMale" | "accessoriesByType">,
    person: { gender: Gender | null; dressTypeId: string | null },
): string[] => {
    const byType = person.dressTypeId ? item.accessoriesByType?.[person.dressTypeId] : null
    if (Array.isArray(byType) && byType.length) return byType
    const specific = person.gender === "FEMALE" ? item.accessoriesFemale : person.gender === "MALE" ? item.accessoriesMale : null
    return specific?.length ? specific : (item.accessories ?? [])
}

type PersonLook = { gender: Gender | null; dressTypeId: string | null }

type ListSource = Parameters<typeof accessoriesForPerson>[0]

export const typeHasList = (item: Pick<ListSource, "accessoriesByType">, dressTypeId: string | null | undefined): dressTypeId is string => {
    if (!dressTypeId) return false
    const list = item.accessoriesByType?.[dressTypeId]
    return Array.isArray(list) && list.length > 0
}

export const loadAuditListSource = async (definitionItemId: string, executor: Pick<typeof db, "select"> = db): Promise<ListSource | null> => {
    const [row] = await executor.select({
        accessories: checklistDefinitionItems.accessories,
        accessoriesFemale: checklistDefinitionItems.accessoriesFemale,
        accessoriesMale: checklistDefinitionItems.accessoriesMale,
        accessoriesByType: checklistDefinitionItems.accessoriesByType,
    }).from(checklistDefinitionItems).where(eq(checklistDefinitionItems.id, definitionItemId)).limit(1)
    return row ?? null
}

const peopleOf = async (tx: Tx, userIds: string[]): Promise<Map<string, PersonLook>> => {
    if (!userIds.length) return new Map()
    const rows = await tx.select({ id: users.id, gender: users.gender, dressTypeId: users.dressTypeId }).from(users).where(inArray(users.id, userIds))
    return new Map(rows.map((r) => [r.id, { gender: r.gender, dressTypeId: r.dressTypeId }]))
}

const stampAuditPeople = async (tx: Tx, itemId: string, userIds: string[], item: GenerationItem) => {
    if (!userIds.length) return
    const people = await peopleOf(tx, userIds)
    const drafts = userIds.map((userId) => {
        const person = people.get(userId) ?? { gender: null, dressTypeId: null }
        const dressTypeId = typeHasList(item, person.dressTypeId) ? person.dressTypeId : null
        return { id: createId(), itemId, userId, dressTypeId, look: { gender: person.gender, dressTypeId } }
    })
    await tx.insert(checklistInstanceItemSubmissions).values(drafts.map(({ look: _look, ...row }) => row))
    const accessoryRows = drafts.flatMap((d) =>
        accessoriesForPerson(item, d.look).map((name) => ({ id: createId(), submissionId: d.id, name, checked: false })),
    )
    if (accessoryRows.length) {
        await tx.insert(checklistInstanceItemSubmissionAccessories).values(accessoryRows)
    }
}

const stampItems = async (tx: Tx, instanceId: string, items: GenerationItem[]) => {
    if (!items.length) return

    const itemIds = items.map(() => createId())
    await tx.insert(checklistInstanceItems).values(
        items.map((item, index) => ({
            id: itemIds[index],
            label: item.label,
            order: item.order,
            section: item.section,
            itemType: item.itemType,
            definitionItemId: item.id,
            ...definitionConfig(item),
            instanceId,
        })),
    )

    for (const [index, item] of items.entries()) {
        const itemId = itemIds[index]
        if (item.itemType === "AUDIT" && itemId) await stampAuditPeople(tx, itemId, item.auditUserIds, item)
    }
}

const stampInstanceContents = async (tx: Tx, instanceId: string, definition: GenerationDefinition) => {
    await stampPeople(tx, instanceId, definition)
    await stampItems(tx, instanceId, definition.items)
}

export type RunScope = { key: string; assigneeIds: string[]; title: string }

const scopedTitle = (name: string, label: string) => `${name} · ${label}`.slice(0, 191)

export const buildScopeResolver = async (definition: GenerationDefinition): Promise<(storeId: string) => RunScope[]> => {
    if (definition.responseMode === "SHARED") {
        return () => [{ key: "", assigneeIds: definition.assigneeIds, title: definition.name }]
    }
    const people = definition.assigneeIds.length
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, departmentId: users.departmentId, storeId: users.storeId })
            .from(users).where(and(inArray(users.id, definition.assigneeIds), eq(users.isActive, true)))
        : []
    const departmentIds = [...new Set(people.map((p) => p.departmentId).filter((id): id is string => !!id))]
    const departmentRows = departmentIds.length
        ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, departmentIds))
        : []
    const departmentName = new Map(departmentRows.map((d) => [d.id, d.name]))

    return (storeId) => {
        const here = definition.storeIds.length > 1 ? people.filter((p) => !p.storeId || p.storeId === storeId) : people
        if (definition.responseMode === "PER_USER") {
            return here.map((p) => ({
                key: `user:${p.id}`,
                assigneeIds: [p.id],
                title: scopedTitle(definition.name, `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`),
            }))
        }
        const byDepartment = new Map<string, string[]>()
        for (const p of here) {
            const key = p.departmentId ?? "none"
            byDepartment.set(key, [...(byDepartment.get(key) ?? []), p.id])
        }
        return [...byDepartment].map(([key, ids]) => ({
            key: `dept:${key}`,
            assigneeIds: ids,
            title: scopedTitle(definition.name, key === "none" ? "No department" : (departmentName.get(key) ?? "Department")),
        }))
    }
}

const generateInstanceForStore = async (
    definition: GenerationDefinition,
    storeId: string,
    period: Period,
    now: Date,
    scope: RunScope,
): Promise<{ id: string } | null> => {
    const instanceId = createId()
    try {
        await db.transaction(async (tx) => {
            await tx.insert(checklistInstances).values({
                id: instanceId,
                definitionId: definition.id,
                title: scope.title,
                recurrence: definition.recurrence,
                storeId,
                scopeKey: scope.key,
                ...timeWindowFor(definition.recurrence, definition.opensTime, definition.cutoffTime, definition.lateUntilTime),
                periodKey: period.periodKey,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                generatedAt: now,
            })

            await stampInstanceContents(tx, instanceId, { ...definition, assigneeIds: scope.assigneeIds })
        })
    } catch (err) {
        if (isDuplicateEntryError(err)) return null
        throw err
    }

    return { id: instanceId }
}

const isHoliday = async (dateStr: string): Promise<boolean> => {
    const [row] = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, dateStr)).limit(1)
    return !!row
}

const applyWorkingDayRules = async (definition: GenerationDefinition, period: Period): Promise<GenerationDefinition | null> => {
    if (definition.recurrence !== "DAILY") return definition
    const dateStr = period.periodStart.toISOString().slice(0, 10)
    const weekday = period.periodStart.getUTCDay()
    const extras = await db.select({ scope: extraWorkingDays.scope, targetIds: extraWorkingDays.targetIds })
        .from(extraWorkingDays).where(eq(extraWorkingDays.date, dateStr))
    const dayOn = !(await isHoliday(dateStr)) && (!definition.activeWeekdays || definition.activeWeekdays.includes(weekday))

    if (!definition.assigneeIds.length) {
        if (dayOn) return definition
        if (extras.some((e) => e.scope === "ALL")) return definition
        const extraStores = new Set(extras.filter((e) => e.scope === "STORE").flatMap((e) => e.targetIds ?? []))
        const storeIds = definition.storeIds.filter((id) => extraStores.has(id))
        return storeIds.length ? { ...definition, storeIds } : null
    }

    const people = await db.select({ id: users.id, weekOffDays: users.weekOffDays, isActive: users.isActive, departmentId: users.departmentId, storeId: users.storeId })
        .from(users).where(inArray(users.id, definition.assigneeIds))
    const departmentIds = [...new Set(people.flatMap((p) => (p.departmentId ? [p.departmentId] : [])))]
    const storeIds = [...new Set(people.flatMap((p) => (p.storeId ? [p.storeId] : [])))]
    const [departmentOff, storeOff] = await Promise.all([
        departmentIds.length ? db.select({ id: departments.id, days: departments.weekOffDays }).from(departments).where(inArray(departments.id, departmentIds)) : [],
        storeIds.length ? db.select({ id: stores.id, days: stores.weekOffDays }).from(stores).where(inArray(stores.id, storeIds)) : [],
    ])
    const departmentDays = new Map(departmentOff.map((d) => [d.id, d.days]))
    const storeDays = new Map(storeOff.map((s) => [s.id, s.days]))
    const offDaysOf = (p: (typeof people)[number]) => effectiveWeekOff(p.weekOffDays, p.storeId ? storeDays.get(p.storeId) : null, p.departmentId ? departmentDays.get(p.departmentId) : null)
    const coveredByExtra = (p: (typeof people)[number]) => extras.some((e) => {
        const ids = e.targetIds ?? []
        if (e.scope === "ALL") return true
        if (e.scope === "PEOPLE") return ids.includes(p.id)
        if (e.scope === "DEPARTMENT") return !!p.departmentId && ids.includes(p.departmentId)
        return !!p.storeId && ids.includes(p.storeId)
    })
    const workingIds = new Set(people
        .filter((p) => p.isActive && ((dayOn && !offDaysOf(p).includes(weekday)) || coveredByExtra(p)))
        .map((p) => p.id))
    const working = definition.assigneeIds.filter((id) => workingIds.has(id))
    if (!working.length) return null
    return working.length === definition.assigneeIds.length ? definition : { ...definition, assigneeIds: working }
}

export const dropRunsNoLongerWorkingOn = async (dateStr: string): Promise<number> => {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const runs = await db.select({ id: checklistInstances.id, storeId: checklistInstances.storeId, definitionId: checklistInstances.definitionId })
        .from(checklistInstances)
        .where(and(eq(checklistInstances.recurrence, "DAILY"), eq(checklistInstances.periodStart, dayStart)))
    if (!runs.length) return 0
    const definitions = await loadDefinitionsForGeneration([...new Set(runs.map((r) => r.definitionId))])
    const fakePeriod = { periodKey: dateStr, periodStart: dayStart, periodEnd: dayStart } as Period
    const workingByDef = new Map<string, GenerationDefinition | null>()
    for (const [id, def] of definitions) workingByDef.set(id, await applyWorkingDayRules(def, fakePeriod))

    let removed = 0
    const affected = new Set<string>()
    for (const run of runs) {
        const working = workingByDef.get(run.definitionId)
        if (working && working.storeIds.includes(run.storeId)) continue
        try {
            const gone = await db.transaction(async (tx) => {
                const [row] = await tx.select().from(checklistInstances).where(eq(checklistInstances.id, run.id)).for("update").limit(1)
                if (!row || await runHasProgress(tx, row)) return false
                const links = await tx.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees)
                    .where(eq(checklistInstanceAssignees.instanceId, run.id))
                await tx.delete(checklistInstances).where(eq(checklistInstances.id, run.id))
                for (const l of links) affected.add(l.userId)
                return true
            })
            if (gone) {
                removed++
                emitChecklistEvent("checklist-instance:updated", { storeId: run.storeId }, { instanceId: run.id })
            }
        } catch (err) {
            console.error(`Removing extra-day run ${run.id} failed:`, err)
        }
    }
    if (affected.size) await dropChecklistSummaries([...affected]).catch((err) => console.error("Clearing checklist summary cache after an extra working day was removed failed:", err))
    return removed
}

export const generateInstanceForDefinition = async (definition: GenerationDefinition, now: Date): Promise<{ id: string }[]> => {
    const offset = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES
    const periods = [
        getCurrentPeriod(definition.recurrence, definition.startDate, now, offset),
        getUpcomingPeriod(definition.recurrence, definition.startDate, now, offset),
    ].filter((p): p is Period => p !== null)
    const created: { id: string }[] = []
    for (const period of periods) created.push(...await generateForPeriod(definition, period, now))
    return created
}

const generateForPeriod = async (definition: GenerationDefinition, period: Period, now: Date): Promise<{ id: string }[]> => {
    if (!definition.storeIds.length) return []

    const working = await applyWorkingDayRules(definition, period)
    if (!working) return []
    definition = working

    const alreadyGeneratedRows = await db.select({ storeId: checklistInstances.storeId, scopeKey: checklistInstances.scopeKey })
        .from(checklistInstances)
        .where(and(
            eq(checklistInstances.definitionId, definition.id),
            inArray(checklistInstances.storeId, definition.storeIds),
            eq(checklistInstances.periodKey, period.periodKey),
        ))
    const alreadyGenerated = new Set(alreadyGeneratedRows.map((r) => `${r.storeId}|${r.scopeKey}`))
    const scopesAt = await buildScopeResolver(definition)

    const created: { id: string }[] = []
    for (const storeId of definition.storeIds) {
        for (const scope of scopesAt(storeId)) {
            if (alreadyGenerated.has(`${storeId}|${scope.key}`)) continue
            try {
                const instance = await generateInstanceForStore(definition, storeId, period, now, scope)
                if (instance) {
                    created.push(instance)
                    emitChecklistEvent("checklist-instance:created", { storeId }, { instanceId: instance.id, definitionId: definition.id })
                }
            } catch (err) {
                console.error(`Checklist instance generation failed for definition ${definition.id}, store ${storeId}, scope ${scope.key || "shared"}:`, err)
            }
        }
    }

    if (definition.recurrence === "ONE_TIME" && created.length) {
        await db.update(checklistDefinitions).set({ isActive: false, updatedAt: new Date() }).where(eq(checklistDefinitions.id, definition.id))
    }

    return created
}

export type LiveRunsSummary = { refreshed: number; updated: number; kept: number }

const hasValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : v != null)

type RunRow = typeof checklistInstances.$inferSelect
type InstanceItemRow = typeof checklistInstanceItems.$inferSelect
type SubmissionRow = typeof checklistInstanceItemSubmissions.$inferSelect

const itemHasAnswer = (i: InstanceItemRow) =>
    i.isDone || i.isNotApplicable
    || hasValue(i.completedAt) || hasValue(i.numericValue) || hasValue(i.booleanAnswer) || hasValue(i.textValue)
    || hasValue(i.dateValue) || hasValue(i.gpsLat) || hasValue(i.gpsLng)
    || hasValue(i.signatureValue) || hasValue(i.secondSignatureValue)
    || hasValue(i.conditionalReasonValue) || hasValue(i.remarks) || hasValue(i.issueId)

const runHasProgress = async (tx: Tx, run: RunRow): Promise<boolean> => {
    if (run.verificationStatus !== "NOT_SUBMITTED" || run.rejectionCount > 0 || run.draftReminderSentAt) return true

    const items = await tx.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, run.id))
    if (items.some(itemHasAnswer)) return true
    if (!items.length) return false
    const itemIds = items.map((i) => i.id)

    const [itemImage] = await tx.select({ id: checklistInstanceImages.id }).from(checklistInstanceImages)
        .where(inArray(checklistInstanceImages.checklistInstanceItemId, itemIds)).limit(1)
    if (itemImage) return true

    const submissions = await tx.select().from(checklistInstanceItemSubmissions)
        .where(inArray(checklistInstanceItemSubmissions.itemId, itemIds))
    if (submissions.some((s) => s.isDone || hasValue(s.remarks) || hasValue(s.completedAt))) return true
    if (!submissions.length) return false
    const submissionIds = submissions.map((s) => s.id)

    const [ticked] = await tx.select({ id: checklistInstanceItemSubmissionAccessories.id }).from(checklistInstanceItemSubmissionAccessories)
        .where(and(
            inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds),
            eq(checklistInstanceItemSubmissionAccessories.checked, true),
        )).limit(1)
    if (ticked) return true

    const [submissionImage] = await tx.select({ id: checklistInstanceItemSubmissionImages.id }).from(checklistInstanceItemSubmissionImages)
        .where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds)).limit(1)
    return !!submissionImage
}

const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase()

export const matchRunItems = (runItems: InstanceItemRow[], defItems: GenerationItem[]) => {
    const defById = new Map(defItems.map((d) => [d.id, d]))
    const takenDef = new Set<string>()
    const pairs: { run: InstanceItemRow; def: GenerationItem }[] = []
    const leftoverRun: InstanceItemRow[] = []

    for (const run of runItems) {
        const def = run.definitionItemId ? defById.get(run.definitionItemId) : undefined
        if (def && def.itemType === run.itemType && !takenDef.has(def.id)) {
            pairs.push({ run, def })
            takenDef.add(def.id)
        } else {
            leftoverRun.push(run)
        }
    }

    const byWording = new Map<string, GenerationItem[]>()
    for (const def of [...defItems].sort((a, b) => a.order - b.order)) {
        if (takenDef.has(def.id)) continue
        const key = `${def.itemType}::${normalizeLabel(def.label)}`
        const bucket = byWording.get(key)
        if (bucket) bucket.push(def)
        else byWording.set(key, [def])
    }
    const unmatchedRun: InstanceItemRow[] = []
    for (const run of [...leftoverRun].sort((a, b) => a.order - b.order)) {
        const def = byWording.get(`${run.itemType}::${normalizeLabel(run.label)}`)?.shift()
        if (def) {
            pairs.push({ run, def })
            takenDef.add(def.id)
        } else {
            unmatchedRun.push(run)
        }
    }

    return { pairs, unmatchedRun, newDefs: defItems.filter((d) => !takenDef.has(d.id)) }
}

const syncAuditPeople = async (
    tx: Tx,
    itemId: string,
    def: GenerationItem,
    submissions: SubmissionRow[],
    accessoriesBySubmission: Map<string, { id: string; name: string }[]>,
): Promise<boolean> => {
    const wanted = new Set(def.auditUserIds)
    const haveUsers = new Set(submissions.map((s) => s.userId))
    const people = await peopleOf(tx, submissions.map((s) => s.userId))

    const added = def.auditUserIds.filter((userId) => !haveUsers.has(userId))
    await stampAuditPeople(tx, itemId, added, def)

    const dropped = submissions.filter((s) => !wanted.has(s.userId) && !s.isDone).map((s) => s.id)
    if (dropped.length) {
        await tx.delete(checklistInstanceItemSubmissions).where(inArray(checklistInstanceItemSubmissions.id, dropped))
    }
    const droppedSet = new Set(dropped)
    const remaining = submissions.filter((s) => !droppedSet.has(s.id))

    for (const submission of remaining) {
        if (submission.isDone) continue
        const pickedTypeId = typeHasList(def, submission.dressTypeId) ? submission.dressTypeId : null
        if (pickedTypeId !== submission.dressTypeId) {
            await tx.update(checklistInstanceItemSubmissions).set({ dressTypeId: pickedTypeId, updatedAt: new Date() }).where(eq(checklistInstanceItemSubmissions.id, submission.id))
        }
        const accessoryNames = accessoriesForPerson(def, { gender: people.get(submission.userId)?.gender ?? null, dressTypeId: pickedTypeId })
        const rows = accessoriesBySubmission.get(submission.id) ?? []
        const haveNames = new Set(rows.map((r) => r.name))
        const missing = accessoryNames.filter((name) => !haveNames.has(name))
        if (missing.length) {
            await tx.insert(checklistInstanceItemSubmissionAccessories).values(
                missing.map((name) => ({ id: createId(), submissionId: submission.id, name, checked: false })),
            )
        }
        const stale = rows.filter((r) => !accessoryNames.includes(r.name)).map((r) => r.id)
        if (stale.length) {
            await tx.delete(checklistInstanceItemSubmissionAccessories).where(inArray(checklistInstanceItemSubmissionAccessories.id, stale))
        }
    }

    return added.length === 0 && remaining.length > 0 && remaining.every((s) => s.isDone)
}

const mergeIntoStartedRun = async (tx: Tx, run: RunRow, working: GenerationDefinition, now: Date) => {
    const runItems = await tx.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, run.id))
    const itemIds = runItems.map((i) => i.id)

    const itemImages = itemIds.length
        ? await tx.select({ itemId: checklistInstanceImages.checklistInstanceItemId }).from(checklistInstanceImages)
            .where(inArray(checklistInstanceImages.checklistInstanceItemId, itemIds))
        : []
    const itemsWithImages = new Set(itemImages.map((r) => r.itemId))

    const submissions = itemIds.length
        ? await tx.select().from(checklistInstanceItemSubmissions).where(inArray(checklistInstanceItemSubmissions.itemId, itemIds))
        : []
    const submissionIds = submissions.map((s) => s.id)
    const accessoryRows = submissionIds.length
        ? await tx.select().from(checklistInstanceItemSubmissionAccessories).where(inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds))
        : []
    const submissionImages = submissionIds.length
        ? await tx.select({ submissionId: checklistInstanceItemSubmissionImages.submissionId }).from(checklistInstanceItemSubmissionImages)
            .where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds))
        : []

    const submissionsByItem = new Map<string, SubmissionRow[]>()
    for (const s of submissions) submissionsByItem.set(s.itemId, [...(submissionsByItem.get(s.itemId) ?? []), s])
    const accessoriesBySubmission = new Map<string, { id: string; name: string; checked: boolean }[]>()
    for (const a of accessoryRows) accessoriesBySubmission.set(a.submissionId, [...(accessoriesBySubmission.get(a.submissionId) ?? []), a])
    const submissionsWithImages = new Set(submissionImages.map((r) => r.submissionId))

    const submissionHasWork = (s: SubmissionRow) =>
        s.isDone || hasValue(s.remarks) || hasValue(s.completedAt)
        || (accessoriesBySubmission.get(s.id) ?? []).some((a) => a.checked) || submissionsWithImages.has(s.id)
    const itemHasWork = (i: InstanceItemRow) =>
        itemHasAnswer(i) || itemsWithImages.has(i.id) || (submissionsByItem.get(i.id) ?? []).some(submissionHasWork)

    const { pairs, unmatchedRun, newDefs } = matchRunItems(runItems, working.items)

    for (const { run: item, def } of pairs) {
        let auditAllDone: boolean | null = null
        if (def.itemType === "AUDIT" && !item.isNotApplicable) {
            auditAllDone = await syncAuditPeople(tx, item.id, def, submissionsByItem.get(item.id) ?? [], accessoriesBySubmission)
        }
        const finished = item.isNotApplicable || (auditAllDone !== null ? auditAllDone : item.isDone)

        const patch: Partial<typeof checklistInstanceItems.$inferInsert> = {
            label: def.label,
            order: def.order,
            section: def.section,
            definitionItemId: def.id,
            updatedAt: now,
        }
        if (!finished) Object.assign(patch, definitionConfig(def))
        if (auditAllDone !== null && auditAllDone !== item.isDone) {
            patch.isDone = auditAllDone
            if (!auditAllDone) { patch.completedAt = null; patch.completedBy = null }
        }
        await tx.update(checklistInstanceItems).set(patch).where(eq(checklistInstanceItems.id, item.id))
    }

    const droppable = unmatchedRun.filter((i) => !itemHasWork(i)).map((i) => i.id)
    if (droppable.length) await tx.delete(checklistInstanceItems).where(inArray(checklistInstanceItems.id, droppable))

    await stampItems(tx, run.id, newDefs)

    await tx.update(checklistInstances).set({
        title: working.name,
        ...timeWindowFor(working.recurrence, working.opensTime, working.cutoffTime, working.lateUntilTime),
        updatedAt: now,
    }).where(eq(checklistInstances.id, run.id))
    await tx.delete(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, run.id))
    await tx.delete(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, run.id))
    await stampPeople(tx, run.id, working)
}

export const syncLiveInstances = async (definition: GenerationDefinition, now: Date): Promise<LiveRunsSummary> => {
    const summary: LiveRunsSummary = { refreshed: 0, updated: 0, kept: 0 }
    const period = getCurrentPeriod(definition.recurrence, definition.startDate, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
    const upcoming = getUpcomingPeriod(definition.recurrence, definition.startDate, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
    if (!period && !upcoming) return summary

    const periods = [period, upcoming].filter((p): p is Period => p !== null)
    const overnight = !!period && definition.recurrence === "DAILY" && !!definition.opensTime && !!definition.cutoffTime && definition.cutoffTime < definition.opensTime
    if (overnight && period) {
        const previous = getCurrentPeriod(definition.recurrence, definition.startDate, new Date(now.getTime() - 24 * 60 * 60 * 1000), env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
        if (previous && previous.periodKey !== period.periodKey) periods.push(previous)
    }

    for (const target of periods) {
    const working = await applyWorkingDayRules(definition, target)
    const scopesAt = working ? await buildScopeResolver(working) : null

    const runs = await db.select({ id: checklistInstances.id }).from(checklistInstances).where(and(
        eq(checklistInstances.definitionId, definition.id),
        eq(checklistInstances.periodKey, target.periodKey),
        target === period ? undefined : sql`${deadlineExpr} > ${localNowExpr}`,
    ))

    for (const { id } of runs) {
        try {
            const outcome = await db.transaction(async (tx) => {
                const [run] = await tx.select().from(checklistInstances)
                    .where(eq(checklistInstances.id, id)).for("update").limit(1)
                if (!run) return null

                const scope = scopesAt?.(run.storeId).find((sc) => sc.key === run.scopeKey)
                const scoped = working && scope ? { ...working, assigneeIds: scope.assigneeIds, name: scope.title } : null

                if (await runHasProgress(tx, run)) {
                    const editable = run.verificationStatus === "NOT_SUBMITTED" || run.verificationStatus === "REJECTED"
                    if (!editable || !scoped || !definition.storeIds.includes(run.storeId)) {
                        return { kind: "kept" as const, storeId: run.storeId }
                    }
                    await mergeIntoStartedRun(tx, run, scoped, now)
                    return { kind: "updated" as const, storeId: run.storeId }
                }

                if (!scoped || !definition.storeIds.includes(run.storeId)) {
                    await tx.delete(checklistInstances).where(eq(checklistInstances.id, id))
                    return { kind: "refreshed" as const, storeId: run.storeId }
                }

                await tx.update(checklistInstances).set({
                    title: scoped.name,
                    recurrence: scoped.recurrence,
                    ...timeWindowFor(scoped.recurrence, scoped.opensTime, scoped.cutoffTime, scoped.lateUntilTime),
                    updatedAt: now,
                }).where(eq(checklistInstances.id, id))
                await tx.delete(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
                await tx.delete(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
                await tx.delete(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, id))
                await stampInstanceContents(tx, id, scoped)
                return { kind: "refreshed" as const, storeId: run.storeId }
            })
            if (!outcome) continue
            summary[outcome.kind]++
            if (outcome.kind === "updated") {
                await syncVerificationStatus(id)
            }
            if (outcome.kind !== "kept") {
                emitChecklistEvent("checklist-instance:updated", { storeId: outcome.storeId }, { instanceId: id })
            }
        } catch (err) {
            console.error(`Updating checklist run ${id} for definition ${definition.id} failed:`, err)
        }
    }
    }
    return summary
}

export const dropUntouchedDailyRunsOn = async (dateStr: string): Promise<number> => {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const runs = await db.select({ id: checklistInstances.id, storeId: checklistInstances.storeId }).from(checklistInstances)
        .where(and(eq(checklistInstances.recurrence, "DAILY"), eq(checklistInstances.periodStart, dayStart)))

    let removed = 0
    const affectedAssignees = new Set<string>()
    for (const { id, storeId } of runs) {
        try {
            const gone = await db.transaction(async (tx) => {
                const [run] = await tx.select().from(checklistInstances).where(eq(checklistInstances.id, id)).for("update").limit(1)
                if (!run || await runHasProgress(tx, run)) return false
                const links = await tx.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees)
                    .where(eq(checklistInstanceAssignees.instanceId, id))
                await tx.delete(checklistInstances).where(eq(checklistInstances.id, id))
                for (const l of links) affectedAssignees.add(l.userId)
                return true
            })
            if (gone) {
                removed++
                emitChecklistEvent("checklist-instance:updated", { storeId }, { instanceId: id })
            }
        } catch (err) {
            console.error(`Removing holiday run ${id} failed:`, err)
        }
    }
    if (removed > 0) await dropChecklistSummaries([...affectedAssignees]).catch((err) => console.error("Clearing checklist summary cache after a holiday failed:", err))
    return removed
}

export const dropUntouchedCurrentRunsFor = async (definitionId: string, now: Date = new Date()): Promise<number> => {
    const localNow = new Date(now.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    const runs = await db.select({ id: checklistInstances.id, storeId: checklistInstances.storeId }).from(checklistInstances)
        .where(and(eq(checklistInstances.definitionId, definitionId), gt(checklistInstances.periodEnd, localNow)))

    let removed = 0
    const affectedAssignees = new Set<string>()
    for (const { id, storeId } of runs) {
        try {
            const gone = await db.transaction(async (tx) => {
                const [run] = await tx.select().from(checklistInstances).where(eq(checklistInstances.id, id)).for("update").limit(1)
                if (!run || await runHasProgress(tx, run)) return false
                const links = await tx.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees)
                    .where(eq(checklistInstanceAssignees.instanceId, id))
                await tx.delete(checklistInstances).where(eq(checklistInstances.id, id))
                for (const l of links) affectedAssignees.add(l.userId)
                return true
            })
            if (gone) {
                removed++
                emitChecklistEvent("checklist-instance:updated", { storeId }, { instanceId: id })
            }
        } catch (err) {
            console.error(`Removing paused run ${id} failed:`, err)
        }
    }
    if (removed > 0) await dropChecklistSummaries([...affectedAssignees]).catch((err) => console.error("Clearing checklist summary cache after a pause failed:", err))
    await clearSummariesForDefinition(definitionId)
    return removed
}

export const clearSummariesForDefinition = async (definitionId: string): Promise<void> => {
    const everyone = await db.selectDistinct({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .where(eq(checklistInstances.definitionId, definitionId))
    if (everyone.length) await dropChecklistSummaries(everyone.map((e) => e.userId)).catch((err) => console.error("Clearing checklist summary cache failed:", err))
}

export const previewDailyRunsOn = async (dateStr: string): Promise<{ untouchedRuns: number; startedRuns: number }> => {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const runs = await db.select().from(checklistInstances)
        .where(and(eq(checklistInstances.recurrence, "DAILY"), eq(checklistInstances.periodStart, dayStart)))
    let untouchedRuns = 0
    let startedRuns = 0
    await db.transaction(async (tx) => {
        for (const run of runs) {
            if (await runHasProgress(tx, run)) startedRuns++
            else untouchedRuns++
        }
    })
    return { untouchedRuns, startedRuns }
}

export const generateDueInstances = async () => {
    const now = new Date()
    const localNow = new Date(now.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    const failures: string[] = []
    let cursor = ""
    for (;;) {
        const definitionRows = await db.select({ id: checklistDefinitions.id }).from(checklistDefinitions)
            .where(and(
                eq(checklistDefinitions.isActive, true),
                lte(checklistDefinitions.startDate, localNow),
                isNull(checklistDefinitions.deletedAt),
                gt(checklistDefinitions.id, cursor),
            ))
            .orderBy(asc(checklistDefinitions.id))
            .limit(GENERATOR_BATCH_SIZE)
        if (!definitionRows.length) break
        cursor = definitionRows[definitionRows.length - 1]!.id

        const definitionsById = await loadDefinitionsForGeneration(definitionRows.map((r) => r.id))
        for (const { id } of definitionRows) {
            try {
                const definition = definitionsById.get(id)
                if (definition) await generateInstanceForDefinition(definition, now)
            } catch (err) {
                console.error(`Checklist instance generation failed for definition ${id}:`, err)
                failures.push(id)
            }
        }
        if (definitionRows.length < GENERATOR_BATCH_SIZE) break
    }
    if (failures.length) throw new Error(`Checklist generation failed for ${failures.length} definition(s): ${failures.slice(0, 5).join(", ")}`)
}

export const startChecklistInstanceGenerator = () => {
    generateDueInstances().catch((err) => console.error("Initial checklist instance generation failed:", err))
    scheduleJob("checklist-generator", "0,30 * * * *", 30, () => generateDueInstances())
}
