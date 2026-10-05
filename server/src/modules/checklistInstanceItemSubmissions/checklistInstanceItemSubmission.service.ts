import { db } from "../../config/db.js"
import {
    checklistInstanceItemSubmissions,
    checklistInstanceItems,
    checklistInstanceItemSubmissionImages,
    checklistInstanceItemSubmissionAccessories,
    checklistInstances,
    checklistInstanceAssignees,
} from "../../db/schema/index.js"
import { and, eq, sql } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { syncVerificationStatus, assertInstanceOpen, assertInstanceEditable } from "../checklistInstances/checklistInstance.service.js"
import { assertRunNotMissed } from "../checklistInstances/checklistMissedRun.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { UpdateChecklistInstanceItemSubmissionAccessoriesInput, UpdateChecklistInstanceItemSubmissionRemarksInput } from "./checklistInstanceItemSubmission.validation.js"

// A submission is one person being audited (ChecklistDefinitionItem.auditUserIds names who gets
// checked). Whoever is running the checklist — ADMIN/PC or any assignee of its instance, the same
// rule every other item type uses — works through everyone on that list, so they may fill in any
// row. The person being audited gets no access of their own: letting someone tick off and submit
// their own uniform check would defeat the audit.
export const assertCanAccess = async (instanceId: string, user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC") return
    const [assignee] = await db.select({ userId: checklistInstanceAssignees.userId })
        .from(checklistInstanceAssignees)
        .where(and(eq(checklistInstanceAssignees.instanceId, instanceId), eq(checklistInstanceAssignees.userId, user.sub)))
        .limit(1)
    if (assignee) return
    throw AppError.forbidden("Only someone assigned to this checklist can fill in this audit")
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
    await assertRunNotMissed(instanceId, user)
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
        await assertCanAccess(item.instanceId, user)
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
        await assertCanAccess(item.instanceId, user)
        assertNotLocked(submission)
        await assertSubmissionRunEditable(item.instanceId, user)

        await db.update(checklistInstanceItemSubmissions).set({ remarks, updatedAt: new Date() }).where(eq(checklistInstanceItemSubmissions.id, id))
        return { ...submission, remarks }
    },

    // `notApplicable` marks this ONE person as not checkable today (absent, on leave): it counts as
    // submitted so the audit can still finish, skips the ticks and photos, and needs a reason
    // (`remarks`, or the one already saved). Any other save, including an admin's reopen, clears it.
    async setDone(id: string, isDone: boolean, user: AccessTokenPayload, options: { notApplicable?: boolean; remarks?: string } = {}) {
        const { submission, item } = await loadSubmissionAndItem(id)
        await assertCanAccess(item.instanceId, user)
        await assertSubmissionRunEditable(item.instanceId, user)

        // Once a person's check is submitted it stays submitted: only an admin may reopen it. A
        // reviewer rejecting the run reopens every submission itself (verify, REJECT), so nobody
        // else needs to undo their own finished work.
        if (!isDone && submission.isDone && user.role !== "ADMIN") {
            throw AppError.forbidden("This check is already submitted. Only an admin can reopen it.")
        }

        // The whole audit was marked not applicable (see setItemDone): there is nobody left to
        // check, and recomputeItemAndVerification below would quietly un-complete that item.
        if (item.isNotApplicable) {
            throw AppError.badRequest("This audit is marked not applicable. Reopen it first to check people.")
        }

        // Fetched once, used both for the opens-time gate below and to know which store's room to
        // broadcast the live update to afterward.
        const [instance] = await db.select({ opensTime: checklistInstances.opensTime, periodStart: checklistInstances.periodStart, storeId: checklistInstances.storeId })
            .from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1)

        const markingNotApplicable = isDone && options.notApplicable === true
        if (options.notApplicable === true && !isDone) {
            throw AppError.badRequest("Send isDone: true with notApplicable.")
        }
        let reason: string | null = null
        if (markingNotApplicable) {
            if (submission.isDone) throw AppError.badRequest("This person is already submitted.")
            reason = (options.remarks ?? submission.remarks)?.trim() || null
            if (!reason) throw AppError.badRequest("Say why this person can't be checked before marking them not applicable.")
        }

        if (isDone) {
            // Same opens-time gate a STANDARD item's setItemDone enforces — an auditor shouldn't be
            // able to complete their submission before the checklist "opens" either.
            if (instance) assertInstanceOpen(instance)

            // Not applicable skips the photo rule: there's nobody to photograph.
            if (!markingNotApplicable) await assertPhotosSatisfied(submission, item)
        }

        const completion = deriveSubmissionCompletion(isDone)
        await db.update(checklistInstanceItemSubmissions).set({
            isDone,
            isNotApplicable: markingNotApplicable,
            ...(markingNotApplicable ? { remarks: reason } : {}),
            completedAt: completion.completedAt,
            updatedAt: new Date(),
        }).where(eq(checklistInstanceItemSubmissions.id, id))

        await recomputeItemAndVerification(item)

        const [updated] = await db.select().from(checklistInstanceItemSubmissions).where(eq(checklistInstanceItemSubmissions.id, id)).limit(1)
        if (instance) emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: item.instanceId })
        return updated
    },
}
