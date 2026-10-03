// Recurrence engine for the Checklist feature: sweeps active ChecklistDefinitions and stamps
// out a fresh, completable ChecklistInstance whenever a definition's current period hasn't been
// generated yet. See utils/period.ts for the period-math this relies on.
import { scheduleJob } from '../utils/jobTracker.js';
import { createId } from "@paralleldrive/cuid2"
import { eq, and, inArray, asc, lte, isNull } from "drizzle-orm"
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
    departments,
} from "../db/schema/index.js"
import type { ChecklistRecurrence, ChecklistResponseMode } from "../db/schema/checklistDefinition.js"
import type { Gender } from "../db/schema/core.js"
import { getCurrentPeriod, type Period } from "../utils/period.js"
import { env } from "../config/env.js"
import { emitChecklistEvent } from "../sockets/checklistEvent.js"
import { syncVerificationStatus } from "../modules/checklistInstances/checklistInstance.service.js"

// Caps how many due checklist definitions get processed in a single hourly sweep, same rationale
// as the batch caps in slaSweep.job.ts/taskDeadlineReminder.job.ts. In practice the number of
// admin-configured definitions is small and slow-growing, but this keeps the guarantee uniform
// across every unattended sweep job rather than leaving this one as the exception.
const GENERATOR_BATCH_SIZE = 500;

// Plain-object shape carrying everything generateInstanceForDefinition needs, decoupled from
// wherever the caller got it from — the sweep below loads it fresh off the DB (loadDefinitionForGeneration),
// while checklistDefinition.service.ts's create()/update() load it the same way right after their
// own transaction commits, so both paths see exactly what was actually persisted (no risk of the
// generator working off stale/unsaved input).
type GenerationItem = {
    id: string
    label: string
    order: number
    section: string | null
    requiredImageCount: number
    maxImageCount: number | null
    requiresLivePhoto: boolean
    itemType: (typeof checklistDefinitionItems.$inferSelect)["itemType"]
    accessories: string[] | null
    accessoriesFemale: string[] | null
    accessoriesMale: string[] | null
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
    activeWeekdays: number[] | null
    responseMode: ChecklistResponseMode
    storeIds: string[]
    assigneeIds: string[]
    reviewerIds: string[]
    items: GenerationItem[]
}

// Assembles the generation-shaped view of a definition straight off the DB (its store/assignee
// junction rows and its items + their audit-user junction rows) — the closest equivalent of the
// old Mongoose-populated definition document the job used to work off of. Deliberately separate
// from checklistDefinition.service.ts's own hydrateDefinitions (which also computes completion/
// quality stats this job has no use for, and importing from that module would create a circular
// import since that service calls back into this one).
export const loadDefinitionForGeneration = async (definitionId: string): Promise<GenerationDefinition | null> =>
    (await loadDefinitionsForGeneration([definitionId])).get(definitionId) ?? null

// Batched sibling of loadDefinitionForGeneration above: 5 queries total for the whole set instead
// of 5 per definition. The hourly sweep used to call the singular loader once per due definition —
// harmless at a handful of definitions, but a batch of GENERATOR_BATCH_SIZE (500) meant up to 2,500
// sequential round trips per tick. Single-definition call sites (create()/update() in
// checklistDefinition.service.ts, via loadDefinitionForGeneration) are unaffected.
export const loadDefinitionsForGeneration = async (definitionIds: string[]): Promise<Map<string, GenerationDefinition>> => {
    const result = new Map<string, GenerationDefinition>()
    if (!definitionIds.length) return result

    // isNull(deletedAt) is defense-in-depth here — every caller (the sweep below, and
    // create()/update() in checklistDefinition.service.ts) already only passes ids it knows are
    // live, but a soft-deleted definition must never generate another instance if that ever changes.
    const rows = await db.select().from(checklistDefinitions).where(and(inArray(checklistDefinitions.id, definitionIds), isNull(checklistDefinitions.deletedAt)))
    const storeLinks = await db.select({ definitionId: checklistDefinitionStores.definitionId, storeId: checklistDefinitionStores.storeId })
        .from(checklistDefinitionStores)
        .where(inArray(checklistDefinitionStores.definitionId, definitionIds))
    const assigneeLinks = await db.select({ definitionId: checklistDefinitionAssignees.definitionId, userId: checklistDefinitionAssignees.userId })
        .from(checklistDefinitionAssignees)
        .where(inArray(checklistDefinitionAssignees.definitionId, definitionIds))
    const reviewerLinks = await db.select({ definitionId: checklistDefinitionReviewers.definitionId, userId: checklistDefinitionReviewers.userId })
        .from(checklistDefinitionReviewers)
        .where(inArray(checklistDefinitionReviewers.definitionId, definitionIds))

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

// Who fills a run in and who reviews it, copied from the definition.
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

// The columns of a run's question that are authored on the checklist question and copied across
// (how the question is answered, its photo rules, its options). Used both to stamp a question onto
// a run and to bring a not-yet-answered question on a started run up to date.
const definitionConfig = (item: GenerationItem) => ({
    // Photo requirements are authored once on the definition item and copied onto
    // every instance it stamps out — an instance item never edits these itself.
    requiredImageCount: item.requiredImageCount,
    maxImageCount: item.maxImageCount,
    requiresLivePhoto: item.requiresLivePhoto,
    // Definition items commonly leave this null (only some items use accessory
    // checkboxes) — the client's ChecklistInstanceItem type declares this a plain
    // string[] (never null), and ChecklistInstanceItemAuditCard.tsx reads
    // `.length` on it unconditionally, so a raw null here crashed the whole
    // checklist detail page for any AUDIT item with no accessories configured.
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
    acceptableAnswers: item.acceptableAnswers,
    acceptableMin: item.acceptableMin,
    acceptableMax: item.acceptableMax,
    yesActions: item.yesActions,
    noActions: item.noActions,
})

// What to check on ONE person: the list for their gender when the question has one, otherwise the
// question's main list (also what someone with no gender set gets).
export const accessoriesForPerson = (
    item: Pick<GenerationItem, "accessories" | "accessoriesFemale" | "accessoriesMale">,
    gender: Gender | null,
): string[] => {
    const specific = gender === "FEMALE" ? item.accessoriesFemale : gender === "MALE" ? item.accessoriesMale : null
    return specific?.length ? specific : (item.accessories ?? [])
}

const gendersOf = async (tx: Tx, userIds: string[]): Promise<Map<string, Gender | null>> => {
    if (!userIds.length) return new Map()
    const rows = await tx.select({ id: users.id, gender: users.gender }).from(users).where(inArray(users.id, userIds))
    return new Map(rows.map((r) => [r.id, r.gender]))
}

// One ticked-off-nothing row per accessory, for each person on an AUDIT question, using the list
// that fits that person (see accessoriesForPerson).
const stampAuditPeople = async (tx: Tx, itemId: string, userIds: string[], item: GenerationItem) => {
    if (!userIds.length) return
    const genders = await gendersOf(tx, userIds)
    const drafts = userIds.map((userId) => ({ id: createId(), itemId, userId }))
    await tx.insert(checklistInstanceItemSubmissions).values(drafts)
    const accessoryRows = drafts.flatMap((d) =>
        accessoriesForPerson(item, genders.get(d.userId) ?? null).map((name) => ({ id: createId(), submissionId: d.id, name, checked: false })),
    )
    if (accessoryRows.length) {
        await tx.insert(checklistInstanceItemSubmissionAccessories).values(accessoryRows)
    }
}

// Stamps checklist questions onto a run as brand-new, unanswered questions. Each one remembers which
// checklist question it came from (definitionItemId), so a later edit can find it again.
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

    // AUDIT items fan out into one ChecklistInstanceItemSubmission per person being audited,
    // seeded with that item's accessories checklist (all unchecked).
    for (const [index, item] of items.entries()) {
        if (item.itemType === "AUDIT") await stampAuditPeople(tx, itemIds[index], item.auditUserIds, item)
    }
}

// Everything under an instance row that comes from its definition: who fills it in, who reviews
// it, and its questions (with one row per audited person on an AUDIT question). Shared by a brand
// new instance (generateInstanceForStore) and by syncLiveInstances, so a run rebuilt after an edit
// is stamped exactly the way a fresh one is.
const stampInstanceContents = async (tx: Tx, instanceId: string, definition: GenerationDefinition) => {
    await stampPeople(tx, instanceId, definition)
    await stampItems(tx, instanceId, definition.items)
}

// One slice of a checklist's people at one store: what a single run is for.
export type RunScope = { key: string; assigneeIds: string[]; title: string }

const scopedTitle = (name: string, label: string) => `${name} · ${label}`.slice(0, 191)

// How a definition's (working) assignees split into runs at a store, by its response mode:
//  SHARED         one run for everyone (key '')
//  PER_USER       one run per person
//  PER_DEPARTMENT one run per department among the assignees (people with no department share one)
// With more than one store, a person who belongs to a store only gets that store's runs; a person
// with no store of their own gets a run at every store. Built once per generation/sync pass.
export const buildScopeResolver = async (definition: GenerationDefinition): Promise<(storeId: string) => RunScope[]> => {
    if (definition.responseMode === "SHARED") {
        return () => [{ key: "", assigneeIds: definition.assigneeIds, title: definition.name }]
    }
    const people = definition.assigneeIds.length
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, departmentId: users.departmentId, storeId: users.storeId })
            .from(users).where(inArray(users.id, definition.assigneeIds))
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

// Stamps out the currently-due ChecklistInstance for one (definition, store) pair. Caller is
// responsible for the "already generated for this period?" check — see generateInstanceForDefinition,
// which does that once for every store up front instead of once per store here.
//
// Wrapped in a single transaction (the original had none, plus a manual delete-the-orphan
// cleanup for when item/submission stamp-out failed after the instance insert had already
// committed) — a deliberate improvement per the migration conventions: if anything in here
// fails, the whole attempt rolls back cleanly instead of leaving a half-stamped-out instance
// behind for the next sweep tick to skip over (its (definitionId, storeId, periodKey) would
// otherwise already "exist" with no items to complete).
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
                opensTime: definition.opensTime,
                cutoffTime: definition.cutoffTime,
                periodKey: period.periodKey,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                generatedAt: now,
            })

            await stampInstanceContents(tx, instanceId, { ...definition, assigneeIds: scope.assigneeIds })
        })
    } catch (err: any) {
        // Duplicate-key race between this run and a concurrent tick for the same period —
        // the unique (definitionId, storeId, periodKey, scopeKey) index already guarantees only one wins.
        if (err?.code === "ER_DUP_ENTRY") return null
        throw err
    }

    return { id: instanceId }
}

// A company-wide day off (Admin -> Holidays). `dateStr` is the org-local day as YYYY-MM-DD, which is
// exactly periodStart's own date because periodStart is that local day written as UTC midnight.
const isHoliday = async (dateStr: string): Promise<boolean> => {
    const [row] = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, dateStr)).limit(1)
    return !!row
}

// Working days + personal week-offs + company holidays (DAILY only — a weekly/monthly run spans
// several days, so one person's day off or one public holiday shouldn't cancel it). periodStart is
// the org-local calendar day written as UTC midnight (utils/period.ts), so its UTC weekday IS the
// local weekday. Returns the definition to stamp this period from (for a DAILY one, with today's
// off-duty assignees filtered out), or null when nothing should run today: a holiday, not a
// working day, or everyone assigned is off. No run means nothing to miss, so no score drops.
const applyWorkingDayRules = async (definition: GenerationDefinition, period: Period): Promise<GenerationDefinition | null> => {
    if (definition.recurrence !== "DAILY") return definition
    if (await isHoliday(period.periodStart.toISOString().slice(0, 10))) return null
    const weekday = period.periodStart.getUTCDay()
    if (definition.activeWeekdays && !definition.activeWeekdays.includes(weekday)) return null
    if (!definition.assigneeIds.length) return definition

    const people = await db.select({ id: users.id, weekOffDays: users.weekOffDays }).from(users).where(inArray(users.id, definition.assigneeIds))
    const offToday = new Set(people.filter((p) => (p.weekOffDays ?? []).includes(weekday)).map((p) => p.id))
    if (!offToday.size) return definition

    const working = definition.assigneeIds.filter((id) => !offToday.has(id))
    // Everyone on this checklist is off today — no run, rather than an overdue one nobody was ever
    // going to fill.
    return working.length ? { ...definition, assigneeIds: working } : null
}

// Stamps out the currently-due ChecklistInstance for one definition, across every store it's live
// in — one independent instance per store, or does nothing if its period hasn't arrived yet.
// Shared by the sweep below and by checklistDefinition.service.ts's create()/update() — a
// freshly-created (or just-reactivated) already-due definition gets its first instance(s)
// immediately instead of waiting for the next hourly tick. Returns the list of newly-created
// instances (empty if none were due/new).
export const generateInstanceForDefinition = async (definition: GenerationDefinition, now: Date): Promise<{ id: string }[]> => {
    const period = getCurrentPeriod(definition.recurrence, definition.startDate, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
    if (!period) return []
    if (!definition.storeIds.length) return []

    const working = await applyWorkingDayRules(definition, period)
    if (!working) return []
    definition = working

    // One query covering every store this definition is live in, instead of one
    // "already generated?" existence check per store.
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
            // Each run is isolated in its own try/catch: one failure (bad data, a transient DB
            // error) must not stop the rest of this definition's runs from being created this tick.
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

    // A ONE_TIME definition has exactly one period, ever — deactivate it once generated (in at
    // least one store) so the sweep doesn't keep re-checking it forever.
    if (definition.recurrence === "ONE_TIME" && created.length) {
        await db.update(checklistDefinitions).set({ isActive: false, updatedAt: new Date() }).where(eq(checklistDefinitions.id, definition.id))
    }

    return created
}

// What an edit did to the runs that already exist for the current period.
//  refreshed — runs nobody had started, rebuilt from the edited checklist (or dropped, if the
//              edit took their store or today out of it)
//  updated   — runs someone had already started, brought up to date in place: renamed/moved/new/
//              removed questions, audit people and times all follow the edit, and every answer
//              already entered stays
//  kept      — runs left exactly as they were: already sent for review or approved (a signed-off
//              record), or started runs whose store or day the edit took out of the checklist
export type LiveRunsSummary = { refreshed: number; updated: number; kept: number }

const hasValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : v != null)

type RunRow = typeof checklistInstances.$inferSelect
type InstanceItemRow = typeof checklistInstanceItems.$inferSelect
type SubmissionRow = typeof checklistInstanceItemSubmissions.$inferSelect

// True when a question on a run holds an answer, a skip or a note (photos and audit rows are
// checked separately, they live in other tables).
const itemHasAnswer = (i: InstanceItemRow) =>
    i.isDone || i.isNotApplicable
    || hasValue(i.completedAt) || hasValue(i.numericValue) || hasValue(i.booleanAnswer) || hasValue(i.textValue)
    || hasValue(i.dateValue) || hasValue(i.gpsLat) || hasValue(i.gpsLng)
    || hasValue(i.signatureValue) || hasValue(i.secondSignatureValue)
    || hasValue(i.conditionalReasonValue) || hasValue(i.remarks) || hasValue(i.issueId)

// True once anyone has done anything on a run: answered or skipped a question, typed a note,
// attached a photo, ticked someone off an audit, or pushed it into review. Deliberately generous —
// a run that merely *might* hold someone's work is never rebuilt from scratch.
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

// Wording compared loosely, so "Check the  badge" and "check the badge " are the same question.
const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase()

// Pairs each question already on a run with the checklist question it came from, so an edit can be
// carried onto the run:
//  1. by the link written when the question was stamped (definitionItemId) — survives a rename or a
//     move to another section, as long as the question kept its type;
//  2. for runs stamped before that link existed (or whose question was re-created), by same type +
//     same wording, first-come in the run's own order.
// Whatever is left over is a run question the checklist no longer has (unmatchedRun) and a checklist
// question the run doesn't have yet (newDefs).
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

// Keeps the people on a started run's AUDIT question in step with the checklist: someone added to
// the audit gets a row to fill in, someone taken off loses theirs unless they were already checked
// (that result is a record and stays), and every open person's tick-list follows the list that fits
// them (by gender). Returns whether everyone left on the question is now submitted.
const syncAuditPeople = async (
    tx: Tx,
    itemId: string,
    def: GenerationItem,
    submissions: SubmissionRow[],
    accessoriesBySubmission: Map<string, { id: string; name: string }[]>,
): Promise<boolean> => {
    const wanted = new Set(def.auditUserIds)
    const haveUsers = new Set(submissions.map((s) => s.userId))
    const genders = await gendersOf(tx, submissions.map((s) => s.userId))

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
        // This person's own list: their gender's list when there is one, the main list otherwise.
        const accessoryNames = accessoriesForPerson(def, genders.get(submission.userId) ?? null)
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

// Brings a run that's already started up to date with the edited checklist WITHOUT touching anyone's
// work. Every question that's still on the checklist keeps its answer and follows the edit (new
// wording, new section, new place in the order); a question nobody touched that the edit removed is
// dropped, one that already holds an answer stays; new questions are added unanswered; the audit's
// people, the times, the assignees and the reviewers follow the edit. A question that's already
// answered keeps the rules it was answered under (photo count, options, range) — only its wording,
// section and place change.
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
        // A not-applicable audit is finished as a whole: its people are left alone.
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
            // The audit's done-ness is derived from its people (see the submission service): someone
            // new to check reopens it, taking the last open person off finishes it.
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
        opensTime: working.opensTime,
        cutoffTime: working.cutoffTime,
        updatedAt: now,
    }).where(eq(checklistInstances.id, run.id))
    await tx.delete(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, run.id))
    await tx.delete(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, run.id))
    await stampPeople(tx, run.id, working)
}

// A run is a snapshot of its checklist taken when it was created, so saving an edit used to leave
// today's runs on the OLD version — the change only showed from the next run, which made an edit
// look like it hadn't saved. Now every run of the current period follows the edit, in place (same
// id, so links and notifications still work):
//  - a run nobody has started is rebuilt from the edited checklist;
//  - a run that's already started is merged: the edit is carried onto it and every answer stays
//    (see mergeIntoStartedRun);
//  - a run already sent for review or approved is a signed-off record and is left alone, like a
//    started run whose store (or day) the edit took out of the checklist.
// Returns how many runs fell in each group.
export const syncLiveInstances = async (definition: GenerationDefinition, now: Date): Promise<LiveRunsSummary> => {
    const summary: LiveRunsSummary = { refreshed: 0, updated: 0, kept: 0 }
    const period = getCurrentPeriod(definition.recurrence, definition.startDate, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
    if (!period) return summary
    const working = await applyWorkingDayRules(definition, period)
    const scopesAt = working ? await buildScopeResolver(working) : null

    const runs = await db.select({ id: checklistInstances.id }).from(checklistInstances).where(and(
        eq(checklistInstances.definitionId, definition.id),
        eq(checklistInstances.periodKey, period.periodKey),
    ))

    for (const { id } of runs) {
        try {
            const outcome = await db.transaction(async (tx) => {
                // Locked, so two saves in a row can't both decide this run is untouched and race.
                const [run] = await tx.select().from(checklistInstances)
                    .where(eq(checklistInstances.id, id)).for("update").limit(1)
                if (!run) return null

                // This run's slice of the people (its department / person), or null when the edit
                // no longer gives it one: then it's handled like a store taken out of the checklist.
                const scope = scopesAt?.(run.storeId).find((sc) => sc.key === run.scopeKey)
                const scoped = working && scope ? { ...working, assigneeIds: scope.assigneeIds, name: scope.title } : null

                if (await runHasProgress(tx, run)) {
                    // Sent for review or approved: nobody may change what a reviewer is looking at.
                    const editable = run.verificationStatus === "NOT_SUBMITTED" || run.verificationStatus === "REJECTED"
                    if (!editable || !scoped || !definition.storeIds.includes(run.storeId)) {
                        return { kind: "kept" as const, storeId: run.storeId }
                    }
                    await mergeIntoStartedRun(tx, run, scoped, now)
                    return { kind: "updated" as const, storeId: run.storeId }
                }

                // The edit took this store out (or made today a day off) and nobody started it:
                // the empty run has no reason to exist any more.
                if (!scoped || !definition.storeIds.includes(run.storeId)) {
                    await tx.delete(checklistInstances).where(eq(checklistInstances.id, id))
                    return { kind: "refreshed" as const, storeId: run.storeId }
                }

                await tx.update(checklistInstances).set({
                    title: scoped.name,
                    recurrence: scoped.recurrence,
                    opensTime: scoped.opensTime,
                    cutoffTime: scoped.cutoffTime,
                    updatedAt: now,
                }).where(eq(checklistInstances.id, id))
                await tx.delete(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
                await tx.delete(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
                // Cascades to the old items' images, submissions, accessories and submission images.
                await tx.delete(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, id))
                await stampInstanceContents(tx, id, scoped)
                return { kind: "refreshed" as const, storeId: run.storeId }
            })
            if (!outcome) continue
            summary[outcome.kind]++
            if (outcome.kind === "updated") {
                // Removing the last open question (or finishing the audit's last open person) can
                // leave the run fully done: move it on to review the way ticking it off would have.
                await syncVerificationStatus(id)
            }
            if (outcome.kind !== "kept") {
                emitChecklistEvent("checklist-instance:updated", { storeId: outcome.storeId }, { instanceId: id })
            }
        } catch (err) {
            // One run failing to update must not stop the rest — it simply keeps its old version.
            console.error(`Updating checklist run ${id} for definition ${definition.id} failed:`, err)
        }
    }
    return summary
}

// Called when a holiday is added for a date that may already have runs (the hourly sweep creates
// the day's runs at the start of the day): every DAILY run for that day that nobody has started is
// removed, so there is no checklist left standing to be missed. A run someone has already started
// stays, since they chose to work that day and their answers are real. Returns how many were removed.
export const dropUntouchedDailyRunsOn = async (dateStr: string): Promise<number> => {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const runs = await db.select({ id: checklistInstances.id, storeId: checklistInstances.storeId }).from(checklistInstances)
        .where(and(eq(checklistInstances.recurrence, "DAILY"), eq(checklistInstances.periodStart, dayStart)))

    let removed = 0
    for (const { id, storeId } of runs) {
        try {
            const gone = await db.transaction(async (tx) => {
                const [run] = await tx.select().from(checklistInstances).where(eq(checklistInstances.id, id)).for("update").limit(1)
                if (!run || await runHasProgress(tx, run)) return false
                await tx.delete(checklistInstances).where(eq(checklistInstances.id, id))
                return true
            })
            if (gone) {
                removed++
                emitChecklistEvent("checklist-instance:updated", { storeId }, { instanceId: id })
            }
        } catch (err) {
            // One run failing to clear must not stop the rest.
            console.error(`Removing holiday run ${id} failed:`, err)
        }
    }
    return removed
}

const generateDueInstances = async () => {
    const now = new Date()
    // Widen the pre-filter by the same org-timezone offset getCurrentPeriod uses, so a definition
    // whose startDate is "today" in local time but still "tomorrow" by raw UTC clock isn't excluded
    // before generateInstanceForDefinition ever gets a chance to evaluate it.
    const localNow = new Date(now.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    const definitionRows = await db.select({ id: checklistDefinitions.id }).from(checklistDefinitions)
        .where(and(
            eq(checklistDefinitions.isActive, true),
            lte(checklistDefinitions.startDate, localNow),
            // A soft-deleted definition must stop generating new instances the moment it's
            // deleted, independent of isActive (a separate pause/resume switch) — see
            // checklistDefinition.service.ts's NOT_DELETED.
            isNull(checklistDefinitions.deletedAt),
        ))
        .orderBy(asc(checklistDefinitions.startDate))
        .limit(GENERATOR_BATCH_SIZE)

    if (definitionRows.length === GENERATOR_BATCH_SIZE) {
        console.warn(`Checklist instance generator: hit the ${GENERATOR_BATCH_SIZE}-definition batch cap — there may be more due definitions still waiting; they'll be picked up on the next sweep.`)
    }

    const definitionsById = await loadDefinitionsForGeneration(definitionRows.map((r) => r.id))
    for (const { id } of definitionRows) {
        // Each definition is isolated in its own try/catch — one bad/malformed definition must
        // not abort the sweep for the rest, unlike the single-collection slaSweep job.
        try {
            const definition = definitionsById.get(id)
            if (definition) await generateInstanceForDefinition(definition, now)
        } catch (err) {
            console.error(`Checklist instance generation failed for definition ${id}:`, err)
        }
    }
}

// Registers the hourly sweep and runs it once immediately, so a freshly deployed server (or a
// definition created mid-day) doesn't wait up to an hour for its first instance. Hourly, not
// every-5-minutes like the SLA sweep: every period boundary here is day-granular, so sub-hour
// polling buys nothing, while hourly stays cheap and tolerates brief downtime near midnight.
export const startChecklistInstanceGenerator = () => {
    generateDueInstances().catch((err) => console.error("Initial checklist instance generation failed:", err))
    scheduleJob("checklist-generator", "0 * * * *", 60, () => {
        generateDueInstances().catch((err) => console.error("Checklist instance sweep failed:", err))
    })
}
