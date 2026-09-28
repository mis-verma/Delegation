import { db } from "../../config/db.js"
import {
    checklistInstanceItemSubmissions,
    checklistInstanceItems,
    checklistInstanceItemSubmissionImages,
    checklistInstanceItemSubmissionAccessories,
    checklistInstances,
} from "../../db/schema/index.js"
import { eq, sql } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { syncVerificationStatus, assertInstanceOpen, assertInstanceEditable } from "../checklistInstances/checklistInstance.service.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { UpdateChecklistInstanceItemSubmissionAccessoriesInput, UpdateChecklistInstanceItemSubmissionRemarksInput } from "./checklistInstanceItemSubmission.validation.js"

// A submission belongs to exactly one named auditor (ChecklistDefinitionItem.auditUserIds names
// specific people, not a group) — tighter than the item-level "any instance assignee" check used
// for STANDARD items.
export const assertCanAccess = (submission: { userId: string }, user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC") return
    if (submission.userId === user.sub) return
    throw AppError.forbidden("Only the named auditor can act on this submission")
}

const assertNotLocked = (submission: { isDone: boolean }) => {
    if (submission.isDone) throw AppError.badRequest("Reopen this submission before editing it")
}

// The run-level approval lock (see assertInstanceEditable) applied to an auditor's submission —
// exported for the submission-image service, which acts on the same submission.
export const assertSubmissionRunEditable = async (instanceId: string, user: AccessTokenPayload) => {
    const [instance] = await db.select({ verificationStatus: checklistInstances.verificationStatus })
        .from(checklistInstances).where(eq(checklistInstances.id, instanceId)).limit(1)
    if (instance) assertInstanceEditable(instance, user)
}

// Never trust the client's isDone — recount qualifying evidence photos from the DB first, same
// rule as checklistInstance.service.ts's assertPhotosSatisfied, just scoped to this one
// submission's own photos rather than the whole item's shared pool.
const assertPhotosSatisfied = async (submission: { id: string }, item: { requiredImageCount: number; requiresLivePhoto: boolean }) => {
    if (item.requiredImageCount <= 0) return
    const images = await db.select().from(checklistInstanceItemSubmissionImages).where(eq(checklistInstanceItemSubmissionImages.submissionId, submission.id))
    const qualifying = item.requiresLivePhoto ? images.filter((img) => img.captureMethod === "LIVE") : images
    if (qualifying.length < item.requiredImageCount) {
        const missing = item.requiredImageCount - qualifying.length
        const kind = item.requiresLivePhoto ? "live photo(s)" : "photo(s)"
        throw AppError.badRequest(`Upload ${missing} more ${kind} before this submission can be marked done`)
    }
}

const loadSubmissionAndItem = async (submissionId: string) => {
    const [submission] = await db.select().from(checklistInstanceItemSubmissions).where(eq(checklistInstanceItemSubmissions.id, submissionId)).limit(1)
    if (!submission) throw AppError.notFound("Submission not found")
    const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, submission.itemId)).limit(1)
    if (!item) throw AppError.notFound("Checklist item not found")
    return { submission, item }
}

// Keep completedAt in sync with isDone, same convention as checklistInstance.service.ts's
// deriveInstanceItemCompletion — this model has no completedBy field to clear.
const deriveSubmissionCompletion = (isDone: boolean): { completedAt: Date | null } => ({
    completedAt: isDone ? new Date() : null,
})

// Recomputes the parent AUDIT item's derived isDone (true once every sibling submission is done)
// and re-syncs the instance's verificationStatus off the back of that — see ChecklistInstanceItem.ts
// for why this is what lets syncVerificationStatus (and every other item.isDone consumer) keep
// working completely unmodified for audit items.
const recomputeItemAndVerification = async (item: { id: string; isDone: boolean; instanceId: string }) => {
    const siblings = await db.select({ isDone: checklistInstanceItemSubmissions.isDone })
        .from(checklistInstanceItemSubmissions)
        .where(eq(checklistInstanceItemSubmissions.itemId, item.id))
    const allDone = siblings.length > 0 && siblings.every((s) => s.isDone)
    if (item.isDone !== allDone) {
        await db.update(checklistInstanceItems).set({ isDone: allDone, updatedAt: new Date() }).where(eq(checklistInstanceItems.id, item.id))
    }

    await syncVerificationStatus(item.instanceId)
}

export const checklistInstanceItemSubmissionService = {
    async updateAccessories(id: string, accessories: UpdateChecklistInstanceItemSubmissionAccessoriesInput["accessories"], user: AccessTokenPayload) {
        const { submission, item } = await loadSubmissionAndItem(id)
        assertCanAccess(submission, user)
        assertNotLocked(submission)
        await assertSubmissionRunEditable(item.instanceId, user)

        // Accessories are now a real child table (one row per accessory, copied from the
        // definition item's `accessories: string[]` at stamp-out) rather than an embedded array
        // replaced wholesale — toggling is an UPDATE by (submissionId, name), not an in-memory
        // array mutation + whole-document save. One batched CASE-WHEN statement, not one UPDATE
        // per accessory in a loop.
        if (accessories.length) {
            const cases = accessories.map((a) => sql`WHEN ${a.name} THEN ${a.checked}`)
            const names = accessories.map((a) => a.name)
            await db.execute(sql`
                UPDATE ${checklistInstanceItemSubmissionAccessories}
                SET checked = CASE name ${sql.join(cases, sql` `)} ELSE checked END, updatedAt = NOW()
                WHERE submissionId = ${id} AND name IN (${sql.join(names.map((n) => sql`${n}`), sql`, `)})
            `)
        }

        const rows = await db.select().from(checklistInstanceItemSubmissionAccessories).where(eq(checklistInstanceItemSubmissionAccessories.submissionId, id))
        return { ...submission, accessories: rows }
    },

    async updateRemarks(id: string, remarks: UpdateChecklistInstanceItemSubmissionRemarksInput["remarks"], user: AccessTokenPayload) {
        const { submission, item } = await loadSubmissionAndItem(id)
        assertCanAccess(submission, user)
        assertNotLocked(submission)
        await assertSubmissionRunEditable(item.instanceId, user)

        await db.update(checklistInstanceItemSubmissions).set({ remarks, updatedAt: new Date() }).where(eq(checklistInstanceItemSubmissions.id, id))
        return { ...submission, remarks }
    },

    async setDone(id: string, isDone: boolean, user: AccessTokenPayload) {
        const { submission, item } = await loadSubmissionAndItem(id)
        assertCanAccess(submission, user)
        await assertSubmissionRunEditable(item.instanceId, user)

        // Fetched once, used both for the opens-time gate below and to know which store's room to
        // broadcast the live update to afterward.
        const [instance] = await db.select({ opensTime: checklistInstances.opensTime, periodStart: checklistInstances.periodStart, storeId: checklistInstances.storeId })
            .from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1)

        if (isDone) {
            // Same opens-time gate a STANDARD item's setItemDone enforces — an auditor shouldn't be
            // able to complete their submission before the checklist "opens" either.
            if (instance) assertInstanceOpen(instance)

            await assertPhotosSatisfied(submission, item)
        }

        const completion = deriveSubmissionCompletion(isDone)
        await db.update(checklistInstanceItemSubmissions).set({
            isDone,
            completedAt: completion.completedAt,
            updatedAt: new Date(),
        }).where(eq(checklistInstanceItemSubmissions.id, id))

        await recomputeItemAndVerification(item)

        const [updated] = await db.select().from(checklistInstanceItemSubmissions).where(eq(checklistInstanceItemSubmissions.id, id)).limit(1)
        if (instance) emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: item.instanceId })
        return updated
    },
}
