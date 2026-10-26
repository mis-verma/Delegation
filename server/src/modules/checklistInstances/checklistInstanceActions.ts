import { conditionalReasonPatch, stalePhotoPurposes } from "./booleanAnswerRules.js"
import { db } from "../../config/db.js"
import {
    checklistInstances,
    checklistInstanceAssignees,
    checklistInstanceReviewers,
    checklistInstanceItems,
    checklistInstanceImages,
    checklistInstanceItemSubmissions,

    users,

} from "../../db/schema/index.js"
import { assertPhotosSatisfied, VALUE_VALIDATORS_BY_ITEM_TYPE, type ItemValueInput } from "./checklistItemValidators.js"
import { eq, and, inArray, isNull, sql } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { notificationService } from "../notifications/notification.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { assertRunOpenForUser } from "./checklistMissedRun.js"
import { canWorkEndedRun, isRunEnded, runClosedMessage, runClosingMs } from "./checklistRunEnd.js"
import { auditService } from "../audit/audit.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { VerifyChecklistInstanceInput, RaiseChecklistTicketInput } from "./checklistInstance.validation.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { env } from "../../config/env.js"
import { stripSecretItemFields, sameStoredValue, getPopulatedInstanceById, assertInstanceOpen, assertInstanceEditable, auditItemSnapshot, assertCanAccess, getDepartmentIdsForUserIds, assertConditionalActionsSatisfied, applyConditionalSideEffects, deriveInstanceItemCompletion, syncVerificationStatus, assertNotOwnRun, assertCanVerify, countsAgainstCompliance, loadWaivable, dropChecklistSummaries } from "./checklistInstanceShared.js"

export const setItemDone = async (itemId: string, isDone: boolean, user: AccessTokenPayload, values: ItemValueInput = {}) => {
    const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1)
    if (!item) throw AppError.notFound("Checklist item not found.")

    const [[instanceRow], assigneeLinkRows] = await Promise.all([
        db.select().from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1),
        db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, item.instanceId)),
    ])
    if (!instanceRow) throw AppError.notFound("Checklist instance not found.")
    const assigneeIds = assigneeLinkRows.map((l) => l.userId)
    assertCanAccess({ assigneeIds }, user)
    const runOpenCheck = assertRunOpenForUser(instanceRow.id, user)
    runOpenCheck.catch(() => undefined)
    assertInstanceEditable(instanceRow, user)
    await runOpenCheck
    if (!isDone && item.isDone && !canWorkEndedRun(user)
        && isRunEnded({ ...instanceRow, totalItems: 1, doneItems: 0 }, Date.now(), env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)) {
        throw AppError.badRequest(runClosedMessage(runClosingMs(instanceRow, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES), env.CHECKLIST_TIMEZONE_OFFSET_MINUTES))
    }

    if (!isDone && item.isDone && user.role !== "ADMIN") {
        throw AppError.forbidden("This step is already done. Only an admin can reopen it.")
    }

    const { remarks: remarkInput, notApplicable, ...answerValues } = values
    const isRemarkOnly = remarkInput !== undefined
        && notApplicable === undefined
        && isDone === item.isDone
        && Object.values(answerValues).every((v) => v === undefined)
    if (isRemarkOnly) {
        const nextRemarks = remarkInput?.trim() ? remarkInput.trim() : null
        if (item.isNotApplicable && !nextRemarks) {
            throw AppError.badRequest("A not-applicable item needs a reason. Edit it instead of clearing it.")
        }
        await db.update(checklistInstanceItems).set({ remarks: nextRemarks, updatedAt: new Date() }).where(eq(checklistInstanceItems.id, itemId))
        const [saved] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1)
        if (!saved) throw AppError.notFound("Checklist item not found.")
        await auditService.record({
            entityType: "ChecklistInstanceItem",
            entityId: itemId,
            action: "UPDATE",
            actorId: user.sub,
            before: auditItemSnapshot(item),
            after: auditItemSnapshot(saved),
        })
        emitChecklistEvent("checklist-instance:updated", { storeId: instanceRow.storeId }, { instanceId: instanceRow.id })
        return stripSecretItemFields(saved)
    }

    const markingNotApplicable = isDone && notApplicable === true
    if (notApplicable === true && !isDone) {
        throw AppError.badRequest("Send isDone: true with notApplicable.")
    }

    if (isDone && item.itemType === "AUDIT") {
        if (!markingNotApplicable) {
            throw AppError.badRequest("Audit items can only be completed by submitting each person's check.")
        }
        const [alreadyChecked] = await db.select({ id: checklistInstanceItemSubmissions.id }).from(checklistInstanceItemSubmissions)
            .where(and(eq(checklistInstanceItemSubmissions.itemId, itemId), eq(checklistInstanceItemSubmissions.isDone, true)))
            .limit(1)
        if (alreadyChecked) {
            throw AppError.badRequest("Some people are already checked on this audit, so it can't be marked not applicable.")
        }
    }

    if (markingNotApplicable) {
        const reason = (remarkInput ?? item.remarks)?.trim()
        if (!reason) throw AppError.badRequest("Say why this step doesn't apply before marking it not applicable.")
    }

    if (isDone) assertInstanceOpen(instanceRow)

    const patch: Partial<typeof checklistInstanceItems.$inferInsert> = {}
    if (values.numericValue !== undefined) patch.numericValue = values.numericValue
    if (values.booleanAnswer !== undefined) patch.booleanAnswer = values.booleanAnswer
    if (values.textValue !== undefined) patch.textValue = values.textValue
    if (values.dateValue !== undefined) {
        const parsed = new Date(values.dateValue)
        if (Number.isNaN(parsed.getTime())) throw AppError.badRequest("That doesn't look like a valid date.")
        patch.dateValue = parsed
    }
    if (values.gpsLat !== undefined) patch.gpsLat = values.gpsLat
    if (values.gpsLng !== undefined) patch.gpsLng = values.gpsLng
    if (values.gpsAccuracy !== undefined) patch.gpsAccuracy = values.gpsAccuracy
    if (values.gpsLat !== undefined || values.gpsLng !== undefined) patch.gpsCapturedAt = new Date()
    if (values.signatureValue !== undefined) patch.signatureValue = values.signatureValue
    if (values.secondSignatureValue !== undefined) patch.secondSignatureValue = values.secondSignatureValue
    if (values.conditionalReasonValue !== undefined) patch.conditionalReasonValue = values.conditionalReasonValue
    const reasonReset = conditionalReasonPatch(item, values)
    if (reasonReset !== undefined) patch.conditionalReasonValue = reasonReset
    const stalePhotos = isDone ? stalePhotoPurposes(item, values) : []
    if (remarkInput !== undefined) patch.remarks = remarkInput?.trim() ? remarkInput.trim() : null
    patch.isNotApplicable = markingNotApplicable
    if (isDone) patch.sendBackNote = null

    const mergedItem = { ...item, ...patch }

    if (stalePhotos.length) {
        await db.delete(checklistInstanceImages).where(and(eq(checklistInstanceImages.checklistInstanceItemId, itemId), inArray(checklistInstanceImages.purpose, stalePhotos)))
    }

    if (isDone && !markingNotApplicable) {
        await assertPhotosSatisfied(mergedItem)
        VALUE_VALIDATORS_BY_ITEM_TYPE[item.itemType]?.(mergedItem, values)
        await assertConditionalActionsSatisfied(mergedItem, values)
    }

    const completion = deriveInstanceItemCompletion(isDone, isDone ? user.sub : null)
    const written = await db.transaction(async (tx) => {
        const [fresh] = await tx.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1).for("update")
        if (!fresh) throw AppError.notFound("Checklist item not found.")

        const alreadyThere = fresh.isDone === isDone
            && (!isDone || fresh.isNotApplicable === markingNotApplicable)
            && Object.entries(patch).every(([key, value]) => key === "sendBackNote" || sameStoredValue((fresh as Record<string, unknown>)[key], value))
        if (alreadyThere) return { fresh, changed: false }

        if (!isDone && fresh.isDone && user.role !== "ADMIN") {
            throw AppError.forbidden("This step is already done. Only an admin can reopen it.")
        }

        await tx.update(checklistInstanceItems).set({
            ...patch,
            isDone,
            completedAt: completion.completedAt,
            completedBy: completion.completedBy,
            updatedAt: new Date(),
        }).where(eq(checklistInstanceItems.id, itemId))
        return { fresh, changed: true }
    })
    if (!written.changed) return stripSecretItemFields(written.fresh)

    let updatedItem = { ...mergedItem, isDone, completedAt: completion.completedAt, completedBy: completion.completedBy }

    if (isDone && !markingNotApplicable) {
        updatedItem = await applyConditionalSideEffects(updatedItem, instanceRow, user, values, item.booleanAnswer)
    }

    await syncVerificationStatus(instanceRow.id)

    const [finalItem] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1)
    if (!finalItem) throw AppError.notFound("Checklist item not found.")

    await Promise.all([
        auditService.record({
            entityType: "ChecklistInstanceItem",
            entityId: itemId,
            action: isDone ? (item.isDone ? "UPDATE" : "COMPLETE") : "REOPEN",
            actorId: user.sub,
            before: auditItemSnapshot(item),
            after: auditItemSnapshot(finalItem),
        }),
        dropChecklistSummaries(assigneeIds),
    ])
    emitChecklistEvent("checklist-instance:updated", { storeId: instanceRow.storeId }, { instanceId: instanceRow.id })
    return stripSecretItemFields(finalItem)
}

export const submit = async (id: string, user: AccessTokenPayload) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    const assigneeIds = assigneeLinks.map((l) => l.userId)
    assertCanAccess({ assigneeIds }, user)

    await assertRunOpenForUser(id, user)
    if (instance.verificationStatus !== "NOT_SUBMITTED" && instance.verificationStatus !== "REJECTED") {
        throw AppError.badRequest(instance.verificationStatus === "APPROVED" ? "This checklist is already approved." : "This checklist has already been submitted.")
    }
    const items = await db.select({ isDone: checklistInstanceItems.isDone }).from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, id))
    const open = items.filter((i) => !i.isDone).length
    if (!items.length || open > 0) {
        throw AppError.badRequest(open === 1 ? "1 question is still open. Finish it, then submit." : `${open} questions are still open. Finish them, then submit.`)
    }

    const now = new Date()
    const [submitted] = await db.update(checklistInstances)
        .set({ verificationStatus: "PENDING_APPROVAL", submittedAt: now, submittedBy: user.sub, approvalReminderSentAt: null, approvalEscalatedAt: null, updatedAt: now })
        .where(and(eq(checklistInstances.id, id), inArray(checklistInstances.verificationStatus, ["NOT_SUBMITTED", "REJECTED"])))
    if (submitted.affectedRows === 0) throw AppError.conflict("This checklist was just submitted. Refresh to see where it stands.")

    notificationService
        .notifyChecklistPendingVerification({ _id: instance.id, title: instance.title, storeId: instance.storeId, assigneeIds })
        .catch((err) => console.error("Failed to notify PC of pending checklist:", err))
    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "SUBMIT", actorId: user.sub,
        before: { verificationStatus: instance.verificationStatus },
        after: { verificationStatus: "PENDING_APPROVAL", submittedAt: now },
    })
    await dropChecklistSummaries(assigneeIds)
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return getPopulatedInstanceById(id)
}

export const sendBack = async (id: string, input: { itemIds: string[]; note: string }, user: AccessTokenPayload) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    if (instance.verificationStatus !== "PENDING_APPROVAL") {
        throw AppError.badRequest("Only a checklist that's waiting for approval can have questions sent back.")
    }

    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    const assigneeDepartmentIds = await getDepartmentIdsForUserIds(assigneeLinks.map((l) => l.userId))
    const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
    assertCanVerify(assigneeDepartmentIds, reviewerLinks.map((l) => l.userId), user)
    assertNotOwnRun(assigneeLinks, user)

    const wanted = [...new Set(input.itemIds)]
    const items = await db.select().from(checklistInstanceItems)
        .where(and(eq(checklistInstanceItems.instanceId, id), inArray(checklistInstanceItems.id, wanted)))
    if (items.length !== wanted.length) throw AppError.badRequest("Some of those questions aren't on this checklist.")

    const now = new Date()
    const note = input.note.trim()
    await db.transaction(async (tx) => {
        const [claimed] = await tx.update(checklistInstances).set({ updatedAt: now })
            .where(and(eq(checklistInstances.id, id), eq(checklistInstances.verificationStatus, "PENDING_APPROVAL")))
        if (claimed.affectedRows === 0) throw AppError.conflict("Someone already decided on this checklist. Refresh to see where it stands.")
        await tx.update(checklistInstanceItems).set({
            sendBackCount: sql`${checklistInstanceItems.sendBackCount} + 1`,
            sentBackFrom: sql`COALESCE(${checklistInstanceItems.completedBy}, ${checklistInstanceItems.sentBackFrom})`,
        }).where(inArray(checklistInstanceItems.id, wanted))
        await tx.update(checklistInstanceItems).set({
            isDone: false, isNotApplicable: false, completedAt: null, completedBy: null, sendBackNote: note, updatedAt: now,
        }).where(inArray(checklistInstanceItems.id, wanted))
        const auditItemIds = items.filter((i) => i.itemType === "AUDIT").map((i) => i.id)
        if (auditItemIds.length) {
            await tx.update(checklistInstanceItemSubmissions).set({ isDone: false, isNotApplicable: false, completedAt: null, updatedAt: now })
                .where(inArray(checklistInstanceItemSubmissions.itemId, auditItemIds))
        }
        await tx.update(checklistInstances).set({
            verificationStatus: "REJECTED",
            verificationNote: note,
            approvalReminderSentAt: null,
            approvalEscalatedAt: null,
            submitReminderSentAt: null,
            rejectionCount: sql`${checklistInstances.rejectionCount} + 1`,
            updatedAt: now,
        }).where(eq(checklistInstances.id, id))
    })

    const labels = items.map((i) => i.label).join(", ")
    notificationService
        .notifyChecklistVerificationResult({ _id: instance.id, title: instance.title, assigneeIds: assigneeLinks.map((l) => l.userId) }, "REJECT", `${labels}: ${note}`)
        .catch((err) => console.error("Failed to notify checklist send-back:", err))
    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "SEND_BACK", actorId: user.sub,
        before: { verificationStatus: instance.verificationStatus },
        after: { verificationStatus: "REJECTED", sentBackItemIds: wanted, note },
    })
    await dropChecklistSummaries(assigneeLinks.map((l) => l.userId))
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return getPopulatedInstanceById(id)
}

export const raiseTicket = async (id: string, itemId: string, input: RaiseChecklistTicketInput, user: AccessTokenPayload) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    if (instance.verificationStatus !== "PENDING_APPROVAL") {
        throw AppError.badRequest("A ticket can be raised only while the checklist is waiting for approval.")
    }

    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    const assigneeIds = assigneeLinks.map((l) => l.userId)
    const assigneeDepartmentIds = await getDepartmentIdsForUserIds(assigneeIds)
    const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
    assertCanVerify(assigneeDepartmentIds, reviewerLinks.map((l) => l.userId), user)
    assertNotOwnRun(assigneeLinks, user)

    const [item] = await db.select().from(checklistInstanceItems)
        .where(and(eq(checklistInstanceItems.id, itemId), eq(checklistInstanceItems.instanceId, id))).limit(1)
    if (!item) throw AppError.notFound("That question isn't on this checklist.")
    if (item.reviewTicketId) throw AppError.conflict("A ticket was already raised for this question.")

    const personId = item.completedBy ?? item.sentBackFrom ?? (assigneeIds.length === 1 ? assigneeIds[0] : null)
    if (!personId) throw AppError.badRequest("Nobody is recorded as answering this question, so there is no one to send the ticket to.")
    if (personId === user.sub) throw AppError.badRequest("You answered this question yourself, so you can't raise a ticket on it.")
    const [person] = await db.select({ isActive: users.isActive, departmentId: users.departmentId }).from(users).where(eq(users.id, personId)).limit(1)
    if (!person?.isActive) throw AppError.badRequest("The person who answered this question is no longer active.")

    const note = input.note.trim()
    const ticket = await ticketService.create({
        title: `Checklist: ${item.label}`.slice(0, 191),
        description: `${note}\n\nRaised during review of the checklist "${instance.title}". Question: ${item.label}`,
        priority: input.priority ?? "MEDIUM",
        assignmentMode: "MANUAL",
        assigneeId: personId,
        storeId: instance.storeId,
        departmentId: person.departmentId ?? undefined,
        tatHours: input.tatHours,
    }, user, {
        skipHeadGate: true,
        inTransaction: async (tx, ticketId) => {
            const [linked] = await tx.update(checklistInstanceItems).set({
                reviewTicketId: ticketId,
                sendBackCount: sql`${checklistInstanceItems.sendBackCount} + 1`,
                sentBackFrom: sql`COALESCE(${checklistInstanceItems.completedBy}, ${checklistInstanceItems.sentBackFrom})`,
                updatedAt: new Date(),
            }).where(and(eq(checklistInstanceItems.id, itemId), isNull(checklistInstanceItems.reviewTicketId)))
            if (linked.affectedRows === 0) throw AppError.conflict("A ticket was already raised for this question.")
        },
    })
    if (!ticket) throw AppError.badRequest("The ticket could not be created. Try again.")

    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "RAISE_TICKET", actorId: user.sub,
        before: { itemId, reviewTicketId: null },
        after: { itemId, question: item.label, reviewTicketId: ticket.id, assigneeId: personId, tatHours: input.tatHours, note },
    })
    await dropChecklistSummaries(assigneeIds)
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return getPopulatedInstanceById(id)
}

export const waiveItem = async (id: string, itemId: string, input: { reason: string }, user: AccessTokenPayload) => {
    const { instance, item } = await loadWaivable(id, itemId, user)
    if (item.waivedAt) throw AppError.badRequest("This question is already waived.")
    if (!countsAgainstCompliance(item)) throw AppError.badRequest("This question does not count against compliance, so there is nothing to waive.")
    const reason = input.reason.trim()
    await db.update(checklistInstanceItems).set({ waivedAt: new Date(), waivedBy: user.sub, waiveReason: reason, updatedAt: new Date() }).where(eq(checklistInstanceItems.id, itemId))
    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "WAIVE", actorId: user.sub,
        before: { itemId, waived: false },
        after: { itemId, question: item.label, waived: true, reason },
    })
    await dropChecklistSummaries(instance.assigneeIds)
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return getPopulatedInstanceById(id)
}

export const unwaiveItem = async (id: string, itemId: string, user: AccessTokenPayload) => {
    const { instance, item } = await loadWaivable(id, itemId, user)
    if (!item.waivedAt) throw AppError.badRequest("This question is not waived.")
    await db.update(checklistInstanceItems).set({ waivedAt: null, waivedBy: null, waiveReason: null, updatedAt: new Date() }).where(eq(checklistInstanceItems.id, itemId))
    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "UNWAIVE", actorId: user.sub,
        before: { itemId, waived: true, reason: item.waiveReason },
        after: { itemId, question: item.label, waived: false },
    })
    await dropChecklistSummaries(instance.assigneeIds)
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return getPopulatedInstanceById(id)
}

export const verify = async (id: string, input: VerifyChecklistInstanceInput, user: AccessTokenPayload) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")

    if (instance.verificationStatus !== "PENDING_APPROVAL") {
        throw AppError.badRequest("This checklist isn't pending approval.")
    }

    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    const assigneeDepartmentIds = await getDepartmentIdsForUserIds(assigneeLinks.map((l) => l.userId))
    const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
    assertCanVerify(assigneeDepartmentIds, reviewerLinks.map((l) => l.userId), user)
    assertNotOwnRun(assigneeLinks, user)

    const now = new Date()
    let afterRow: typeof instance

    if (input.action === "APPROVE") {
        afterRow = { ...instance, verificationStatus: "APPROVED", verifiedBy: user.sub, verifiedAt: now, verificationNote: input.note ?? null, updatedAt: now }
        const [approved] = await db.update(checklistInstances).set({
            verificationStatus: "APPROVED",
            verifiedBy: user.sub,
            verifiedAt: now,
            verificationNote: input.note ?? null,
            approvalReminderSentAt: null,
            approvalEscalatedAt: null,
            updatedAt: now,
        }).where(and(eq(checklistInstances.id, id), eq(checklistInstances.verificationStatus, "PENDING_APPROVAL")))
        if (approved.affectedRows === 0) throw AppError.conflict("Someone already decided on this checklist. Refresh to see where it stands.")
    } else {
        afterRow = { ...instance, verificationStatus: "REJECTED", verificationNote: input.note ?? null, rejectionCount: instance.rejectionCount + 1, updatedAt: now }
        await db.transaction(async (tx) => {
            const [rejected] = await tx.update(checklistInstances).set({
                verificationStatus: "REJECTED",
                verificationNote: input.note ?? null,
                approvalReminderSentAt: null,
                approvalEscalatedAt: null,
                submitReminderSentAt: null,
                rejectionCount: sql`${checklistInstances.rejectionCount} + 1`,
                updatedAt: now,
            }).where(and(eq(checklistInstances.id, id), eq(checklistInstances.verificationStatus, "PENDING_APPROVAL")))
            if (rejected.affectedRows === 0) throw AppError.conflict("Someone already decided on this checklist. Refresh to see where it stands.")
            await tx.update(checklistInstanceItems).set({
                isDone: false,
                completedAt: null,
                completedBy: null,
                updatedAt: now,
            }).where(eq(checklistInstanceItems.instanceId, id))
            await tx.update(checklistInstanceItemSubmissions).set({ isDone: false, isNotApplicable: false, completedAt: null, updatedAt: now })
                .where(sql`${checklistInstanceItemSubmissions.itemId} IN (SELECT id FROM ${checklistInstanceItems} WHERE ${checklistInstanceItems.instanceId} = ${id})`)
        })
    }

    notificationService
        .notifyChecklistVerificationResult({ _id: instance.id, title: instance.title, assigneeIds: assigneeLinks.map(l => l.userId) }, input.action, input.note)
        .catch((err) => console.error("Failed to notify checklist verification result:", err))

    await auditService.record({
        entityType: "ChecklistInstance",
        entityId: id,
        action: input.action === "APPROVE" ? "APPROVE" : "REJECT",
        actorId: user.sub,
        before: instance,
        after: afterRow,
    })

    await dropChecklistSummaries(assigneeLinks.map((l) => l.userId))
    const result = await getPopulatedInstanceById(id)
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return result!
}

export const reopenApproval = async (id: string, user: AccessTokenPayload) => {
    if (user.role !== "ADMIN") throw AppError.forbidden("Only an admin can reopen an approval.")
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    if (instance.verificationStatus !== "APPROVED") {
        throw AppError.badRequest("Only an approved checklist can be reopened for approval.")
    }

    const now = new Date()
    const [reopened] = await db.update(checklistInstances).set({
        verificationStatus: "PENDING_APPROVAL",
        verifiedBy: null,
        verifiedAt: null,
        verificationNote: null,
        approvalReminderSentAt: null,
        approvalEscalatedAt: null,
        updatedAt: now,
    }).where(and(eq(checklistInstances.id, id), eq(checklistInstances.verificationStatus, "APPROVED")))
    if (reopened.affectedRows === 0) throw AppError.conflict("This approval was just changed. Refresh to see where it stands.")

    await auditService.record({
        entityType: "ChecklistInstance", entityId: id, action: "REOPEN_APPROVAL", actorId: user.sub,
        before: { verificationStatus: instance.verificationStatus, verifiedBy: instance.verifiedBy, verifiedAt: instance.verifiedAt, verificationNote: instance.verificationNote },
        after: { verificationStatus: "PENDING_APPROVAL" },
    })
    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    await dropChecklistSummaries(assigneeLinks.map((l) => l.userId))
    emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
    return getPopulatedInstanceById(id)
}
