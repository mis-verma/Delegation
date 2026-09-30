// Recurrence engine for the Checklist feature: sweeps active ChecklistDefinitions and stamps
// out a fresh, completable ChecklistInstance whenever a definition's current period hasn't been
// generated yet. See utils/period.ts for the period-math this relies on.
import cron from "node-cron"
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
} from "../db/schema/index.js"
import type { ChecklistRecurrence } from "../db/schema/checklistDefinition.js"
import { getCurrentPeriod, type Period } from "../utils/period.js"
import { env } from "../config/env.js"
import { emitChecklistEvent } from "../sockets/checklistEvent.js"

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
            storeIds: (storesByDef.get(row.id) ?? []).map((l) => l.storeId),
            assigneeIds: (assigneesByDef.get(row.id) ?? []).map((l) => l.userId),
            reviewerIds: (reviewersByDef.get(row.id) ?? []).map((l) => l.userId),
            items: (itemsByDef.get(row.id) ?? []).map((item) => ({ ...item, auditUserIds: auditUserIdsByItem.get(item.id) ?? [] })),
        })
    }
    return result
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Everything under an instance row that comes from its definition: who fills it in, who reviews
// it, and its questions (with one row per audited person on an AUDIT question). Shared by a brand
// new instance (generateInstanceForStore) and by refreshUntouchedInstances, so a run rebuilt after
// an edit is stamped exactly the way a fresh one is.
const stampInstanceContents = async (tx: Tx, instanceId: string, definition: GenerationDefinition) => {
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

    if (!definition.items.length) return

    const itemIds = definition.items.map(() => createId())
    await tx.insert(checklistInstanceItems).values(
        definition.items.map((item, index) => ({
            id: itemIds[index],
            label: item.label,
            order: item.order,
            section: item.section,
            // Photo requirements are authored once on the definition item and copied onto
            // every instance it stamps out — an instance item never edits these itself.
            requiredImageCount: item.requiredImageCount,
            maxImageCount: item.maxImageCount,
            requiresLivePhoto: item.requiresLivePhoto,
            itemType: item.itemType,
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
            yesActions: item.yesActions,
            noActions: item.noActions,
            instanceId,
        })),
    )

    // AUDIT items fan out into one ChecklistInstanceItemSubmission per person being audited,
    // seeded with that item's accessories checklist (all unchecked).
    const submissionDrafts = definition.items.flatMap((item, index) => {
        if (item.itemType !== "AUDIT" || !item.auditUserIds.length) return []
        const itemId = itemIds[index]
        return item.auditUserIds.map((userId) => ({
            id: createId(),
            itemId,
            userId,
            accessories: item.accessories ?? [],
        }))
    })
    if (submissionDrafts.length) {
        await tx.insert(checklistInstanceItemSubmissions).values(
            submissionDrafts.map((d) => ({ id: d.id, itemId: d.itemId, userId: d.userId })),
        )
        const accessoryRows = submissionDrafts.flatMap((d) =>
            d.accessories.map((name) => ({ id: createId(), submissionId: d.id, name, checked: false })),
        )
        if (accessoryRows.length) {
            await tx.insert(checklistInstanceItemSubmissionAccessories).values(accessoryRows)
        }
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
): Promise<{ id: string } | null> => {
    const instanceId = createId()
    try {
        await db.transaction(async (tx) => {
            await tx.insert(checklistInstances).values({
                id: instanceId,
                definitionId: definition.id,
                title: definition.name,
                recurrence: definition.recurrence,
                storeId,
                opensTime: definition.opensTime,
                cutoffTime: definition.cutoffTime,
                periodKey: period.periodKey,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                generatedAt: now,
            })

            await stampInstanceContents(tx, instanceId, definition)
        })
    } catch (err: any) {
        // Duplicate-key race between this run and a concurrent tick for the same period —
        // the unique (definitionId, storeId, periodKey) index already guarantees only one wins.
        if (err?.code === "ER_DUP_ENTRY") return null
        throw err
    }

    return { id: instanceId }
}

// Working days + personal week-offs (DAILY only — a weekly/monthly run spans several days, so one
// person's day off shouldn't cancel it). periodStart is the org-local calendar day written as UTC
// midnight (utils/period.ts), so its UTC weekday IS the local weekday. Returns the definition to
// stamp this period from (for a DAILY one, with today's off-duty assignees filtered out), or null
// when nothing should run today: not a working day, or everyone assigned is off.
const applyWorkingDayRules = async (definition: GenerationDefinition, period: Period): Promise<GenerationDefinition | null> => {
    if (definition.recurrence !== "DAILY") return definition
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
    const alreadyGeneratedRows = await db.select({ storeId: checklistInstances.storeId })
        .from(checklistInstances)
        .where(and(
            eq(checklistInstances.definitionId, definition.id),
            inArray(checklistInstances.storeId, definition.storeIds),
            eq(checklistInstances.periodKey, period.periodKey),
        ))
    const alreadyGeneratedSet = new Set(alreadyGeneratedRows.map((r) => r.storeId))
    const pendingStoreIds = definition.storeIds.filter((storeId) => !alreadyGeneratedSet.has(storeId))
    if (!pendingStoreIds.length) return []

    const created: { id: string }[] = []
    for (const storeId of pendingStoreIds) {
        // Each store is isolated in its own try/catch — one store's failure (bad data, a
        // transient DB error) must not stop the rest of this definition's stores from getting
        // their instance this tick.
        try {
            const instance = await generateInstanceForStore(definition, storeId, period, now)
            if (instance) {
                created.push(instance)
                emitChecklistEvent("checklist-instance:created", { storeId }, { instanceId: instance.id, definitionId: definition.id })
            }
        } catch (err) {
            console.error(`Checklist instance generation failed for definition ${definition.id}, store ${storeId}:`, err)
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
//  refreshed  — runs nobody had started, rebuilt from the edited checklist (or dropped, if the
//               edit took their store or today out of it)
//  inProgress — runs someone had already started, left exactly as they were
export type LiveRunsSummary = { refreshed: number; inProgress: number }

const hasValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : v != null)

// True once anyone has done anything on a run: answered or skipped a question, typed a note,
// attached a photo, ticked someone off an audit, or pushed it into review. Deliberately generous —
// a run that merely *might* hold someone's work is never rebuilt.
const runHasProgress = async (tx: Tx, run: typeof checklistInstances.$inferSelect): Promise<boolean> => {
    if (run.verificationStatus !== "NOT_SUBMITTED" || run.rejectionCount > 0 || run.draftReminderSentAt) return true

    const items = await tx.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, run.id))
    if (items.some((i) =>
        i.isDone || i.isNotApplicable
        || hasValue(i.completedAt) || hasValue(i.numericValue) || hasValue(i.booleanAnswer) || hasValue(i.textValue)
        || hasValue(i.dateValue) || hasValue(i.gpsLat) || hasValue(i.gpsLng)
        || hasValue(i.signatureValue) || hasValue(i.secondSignatureValue)
        || hasValue(i.conditionalReasonValue) || hasValue(i.remarks) || hasValue(i.issueId),
    )) return true
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

// A run is a snapshot of its checklist taken when it was created (an edit mustn't rewrite work
// someone has already done), so saving an edit used to leave today's run on the OLD version — the
// change only showed from the next run. That's right once a run has answers in it, but for a run
// nobody has touched it just made the edit look like it hadn't saved. This rebuilds every such
// run from the edited checklist, in place (same id, so links and notifications still work), and
// reports how many runs were left alone because they're already in progress.
export const refreshUntouchedInstances = async (definition: GenerationDefinition, now: Date): Promise<LiveRunsSummary> => {
    const summary: LiveRunsSummary = { refreshed: 0, inProgress: 0 }
    const period = getCurrentPeriod(definition.recurrence, definition.startDate, now, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)
    if (!period) return summary
    const working = await applyWorkingDayRules(definition, period)

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
                if (await runHasProgress(tx, run)) return { kind: "inProgress" as const, storeId: run.storeId }

                // The edit took this store out (or made today a day off) and nobody started it:
                // the empty run has no reason to exist any more.
                if (!working || !definition.storeIds.includes(run.storeId)) {
                    await tx.delete(checklistInstances).where(eq(checklistInstances.id, id))
                    return { kind: "refreshed" as const, storeId: run.storeId }
                }

                await tx.update(checklistInstances).set({
                    title: working.name,
                    recurrence: working.recurrence,
                    opensTime: working.opensTime,
                    cutoffTime: working.cutoffTime,
                    updatedAt: new Date(),
                }).where(eq(checklistInstances.id, id))
                await tx.delete(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
                await tx.delete(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
                // Cascades to the old items' images, submissions, accessories and submission images.
                await tx.delete(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, id))
                await stampInstanceContents(tx, id, working)
                return { kind: "refreshed" as const, storeId: run.storeId }
            })
            if (!outcome) continue
            summary[outcome.kind]++
            if (outcome.kind === "refreshed") {
                emitChecklistEvent("checklist-instance:updated", { storeId: outcome.storeId }, { instanceId: id })
            }
        } catch (err) {
            // One run failing to refresh must not stop the rest — it simply keeps its old version.
            console.error(`Refreshing checklist run ${id} for definition ${definition.id} failed:`, err)
        }
    }
    return summary
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
    cron.schedule("0 * * * *", () => {
        generateDueInstances().catch((err) => console.error("Checklist instance sweep failed:", err))
    })
}
