import { conditionalPhotoPurposeFor } from "./booleanAnswerRules.js"
import { db } from "../../config/db.js"
import {
    checklistInstances,
    checklistInstanceAssignees,
    checklistInstanceReviewers,
    checklistInstanceItems,
    checklistInstanceImages,
    checklistInstanceItemSubmissions,
    checklistInstanceItemSubmissionAccessories,
    checklistInstanceItemSubmissionImages,
    checklistDefinitions,
    checklistDefinitionItems,
    users,
    dressTypes,

    CHECKLIST_RECURRENCES,
    CHECKLIST_VERIFICATION_STATUSES,
} from "../../db/schema/index.js"
import { groupBy } from "../../utils/groupBy.js"
import { approvalCoverService } from "../approvalCover/approvalCover.service.js"
import { UPCOMING_LEAD_DAYS } from "../../utils/period.js"
import { CAN_VERIFY_BY_ROLE, coverCanVerify } from "./checklistVerifyRules.js"
import { assertCoordinatorRunReviewer, coordinatorAssigneeIds, coordinatorRunSql } from "./checklistCoordinatorRun.js"
import { type ChecklistItem, type ItemValueInput } from "./checklistItemValidators.js"
import { dropScoreCache } from "../scores/scoreCache.js"
import { eq, and, inArray, isNull, asc, sql, gte, lt, type SQL } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { notificationService } from "../notifications/notification.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { closedBeforeTodayExpr, missedInstanceIds, localNowSql, runDeadlineSql } from "./checklistMissedRun.js"
import { hasRunDeadlinePassed, isRunEnded, runClosingMs, runPhase } from "./checklistRunEnd.js"
import { bumpVersions } from "../../config/queryCache.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { env } from "../../config/env.js"
import { orgLocalDate, addDays, utcSql, asOrgDay } from "./checklistReportRange.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { clockParts } from "../../utils/clock.js"

export type InstanceStatusFilter = "OPEN" | "DUE" | "COMPLETED" | "OVERDUE"

export type ChecklistPendingApprovalRow = {
    id: string
    title: string
    storeName: string | null
    submittedBy: string | null
    waitingSince: string
}

export const stripSecretItemFields = <T extends { qrExpectedValue?: string | null }>(item: T): T => ({ ...item, qrExpectedValue: null })

export const hydrateInstances = async (instanceRows: (typeof checklistInstances.$inferSelect)[]) => {
    if (!instanceRows.length) return []
    const instanceIds = instanceRows.map((i) => i.id)

    const assigneeLinks = await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, instanceIds))
    const assigneeIdsByInstance = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        assigneeIdsByInstance.set(link.instanceId, list)
    }

    const coordinatorIds = await coordinatorAssigneeIds([...new Set(assigneeLinks.map((l) => l.userId))])

    const reviewerLinks = await db.select().from(checklistInstanceReviewers).where(inArray(checklistInstanceReviewers.instanceId, instanceIds))
    const reviewerIdsByInstance = new Map<string, string[]>()
    for (const link of reviewerLinks) {
        const list = reviewerIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        reviewerIdsByInstance.set(link.instanceId, list)
    }

    const items = await db.select().from(checklistInstanceItems).where(inArray(checklistInstanceItems.instanceId, instanceIds)).orderBy(asc(checklistInstanceItems.order))
    const itemIds = items.map((i) => i.id)

    const images = itemIds.length ? await db.select().from(checklistInstanceImages).where(inArray(checklistInstanceImages.checklistInstanceItemId, itemIds)) : []
    const imagesByItem = new Map<string, typeof images>()
    for (const img of images) {
        const list = imagesByItem.get(img.checklistInstanceItemId) ?? []
        list.push(img)
        imagesByItem.set(img.checklistInstanceItemId, list)
    }

    const hashes = [...new Set(images.map((img) => img.contentHash).filter((h): h is string => !!h))]
    const sameHash = hashes.length
        ? await db.select({ id: checklistInstanceImages.id, hash: checklistInstanceImages.contentHash, itemId: checklistInstanceImages.checklistInstanceItemId, createdAt: checklistInstanceImages.createdAt })
            .from(checklistInstanceImages).where(inArray(checklistInstanceImages.contentHash, hashes))
        : []
    const sameHashByHash = new Map<string, typeof sameHash>()
    for (const row of sameHash) {
        const list = sameHashByHash.get(row.hash!) ?? []
        list.push(row)
        sameHashByHash.set(row.hash!, list)
    }
    const runCreatedAt = new Map(instanceRows.map((i) => [i.id, i.createdAt]))
    const runOfItem = new Map<string, string>()
    for (const i of items) runOfItem.set(i.id, i.instanceId)
    const annotateImage = (img: (typeof images)[number]) => {
        const earlier = !!img.contentHash && (sameHashByHash.get(img.contentHash) ?? []).some((o) =>
            o.id !== img.id && o.itemId !== img.checklistInstanceItemId
            && (o.createdAt.getTime() < img.createdAt.getTime() || (o.createdAt.getTime() === img.createdAt.getTime() && o.id < img.id)))
        const runStart = runCreatedAt.get(runOfItem.get(img.checklistInstanceItemId) ?? "")
        return { ...img, reusedFromEarlier: earlier || !!img.similarToId, takenBeforeRun: !!img.takenAt && !!runStart && img.takenAt.getTime() < runStart.getTime() }
    }

    const submissions = itemIds.length ? await db.select().from(checklistInstanceItemSubmissions).where(inArray(checklistInstanceItemSubmissions.itemId, itemIds)) : []
    const submissionIds = submissions.map((s) => s.id)

    const accessories = submissionIds.length ? await db.select().from(checklistInstanceItemSubmissionAccessories).where(inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds)) : []
    const accessoriesBySubmission = new Map<string, typeof accessories>()
    for (const a of accessories) {
        const list = accessoriesBySubmission.get(a.submissionId) ?? []
        list.push(a)
        accessoriesBySubmission.set(a.submissionId, list)
    }

    const submissionImages = submissionIds.length ? await db.select().from(checklistInstanceItemSubmissionImages).where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds)) : []
    const submissionImagesBySubmission = new Map<string, typeof submissionImages>()
    for (const img of submissionImages) {
        const list = submissionImagesBySubmission.get(img.submissionId) ?? []
        list.push(img)
        submissionImagesBySubmission.set(img.submissionId, list)
    }

    const submissionUserIds = [...new Set(submissions.map((s) => s.userId))]
    const submissionUsers = submissionUserIds.length
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, storeId: users.storeId, isActive: users.isActive, gender: users.gender }).from(users).where(inArray(users.id, submissionUserIds))
        : []
    const submissionUserById = new Map(submissionUsers.map((u) => [u.id, u]))

    const auditItems = items.filter((i) => i.itemType === "AUDIT")
    const definitionItemIds = [...new Set(auditItems.map((i) => i.definitionItemId).filter((id): id is string => !!id))]
    const typeListRows = definitionItemIds.length
        ? await db.select({ id: checklistDefinitionItems.id, accessoriesByType: checklistDefinitionItems.accessoriesByType }).from(checklistDefinitionItems).where(inArray(checklistDefinitionItems.id, definitionItemIds))
        : []
    const typeIdsByDefinitionItem = new Map(typeListRows.map((r) => [
        r.id,
        Object.entries(r.accessoriesByType ?? {}).filter(([, list]) => Array.isArray(list) && list.length > 0).map(([typeId]) => typeId),
    ]))
    const wantedTypeIds = [...new Set([
        ...submissions.map((s) => s.dressTypeId).filter((id): id is string => !!id),
        ...[...typeIdsByDefinitionItem.values()].flat(),
    ])]
    const dressTypeRows = wantedTypeIds.length
        ? await db.select({ id: dressTypes.id, name: dressTypes.name, gender: dressTypes.gender, isActive: dressTypes.isActive }).from(dressTypes).where(inArray(dressTypes.id, wantedTypeIds))
        : []
    const dressTypeById = new Map(dressTypeRows.map((t) => [t.id, t]))
    const dressTypeOptionsFor = (definitionItemId: string | null) =>
        (definitionItemId ? typeIdsByDefinitionItem.get(definitionItemId) ?? [] : [])
            .map((typeId) => dressTypeById.get(typeId))
            .filter((t): t is NonNullable<typeof t> => !!t && t.isActive)
            .map((t) => ({ id: t.id, name: t.name, gender: t.gender }))
            .sort((x, y) => x.name.localeCompare(y.name))

    const submissionViews = submissions.map((submission) => ({
            ...submission,
            userId: submissionUserById.get(submission.userId) ?? null,
            dressType: submission.dressTypeId && dressTypeById.has(submission.dressTypeId)
                ? { id: submission.dressTypeId, name: dressTypeById.get(submission.dressTypeId)!.name }
                : null,
            accessories: (accessoriesBySubmission.get(submission.id) ?? []).map((a) => ({ id: a.id, name: a.name, checked: a.checked })),
            images: submissionImagesBySubmission.get(submission.id) ?? [],
        }))
    const submissionsByItem = groupBy(submissionViews, (view) => view.itemId)

    const nameUserIds = [...new Set([
        ...items.map((i) => i.completedBy).filter((id): id is string => !!id),
        ...instanceRows.map((i) => i.submittedBy).filter((id): id is string => !!id),
    ])]
    const nameRows = nameUserIds.length
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, nameUserIds))
        : []
    const nameById = new Map(nameRows.map((u) => [u.id, `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`]))

    const itemViews = items.map((item) => ({
            ...stripSecretItemFields(item),
            completedByName: item.completedBy ? (nameById.get(item.completedBy) ?? null) : null,
            images: (imagesByItem.get(item.id) ?? []).map(annotateImage),
            submissions: submissionsByItem.get(item.id) ?? [],
            ...(item.itemType === "AUDIT" ? { dressTypeOptions: dressTypeOptionsFor(item.definitionItemId) } : {}),
        }))
    const itemsByInstance = groupBy(itemViews, (view) => view.instanceId)

    const nowMs = Date.now()
    const offsetMinutes = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES

    return instanceRows.map((instance) => {
        const runItems = itemsByInstance.get(instance.id) ?? []
        const endInput = { ...instance, totalItems: runItems.length, doneItems: runItems.filter((i) => i.isDone).length }
        return {
            ...instance,
            isMissed: isRunEnded(endInput, nowMs, offsetMinutes),
            isEnded: hasRunDeadlinePassed(instance, nowMs, offsetMinutes),
            isLate: runPhase(endInput, nowMs, offsetMinutes) === "late",
            endedAt: new Date(runClosingMs(instance, offsetMinutes)).toISOString(),
            assigneeIds: assigneeIdsByInstance.get(instance.id) ?? [],
            coordinatorRun: (assigneeIdsByInstance.get(instance.id) ?? []).some((id) => coordinatorIds.has(id)),
            reviewerIds: reviewerIdsByInstance.get(instance.id) ?? [],
            submittedByName: instance.submittedBy ? (nameById.get(instance.submittedBy) ?? null) : null,
            items: runItems,
        }
    })
}

export const sameStoredValue = (stored: unknown, incoming: unknown): boolean => {
    if (stored instanceof Date || incoming instanceof Date) {
        return stored instanceof Date && incoming instanceof Date && stored.getTime() === incoming.getTime()
    }
    return (stored ?? null) === (incoming ?? null)
}

export const getPopulatedInstanceById = async (id: string) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) return null
    const [hydrated] = await hydrateInstances([instance])
    return hydrated
}

export const assertInstanceOpen = (instance: { opensTime: string | null; periodStart: Date; recurrence?: string }) => {
    const leadMs = instance.recurrence && instance.recurrence !== "DAILY" && instance.recurrence !== "ONE_TIME" ? UPCOMING_LEAD_DAYS * 86_400_000 : 0
    const [hours, minutes] = instance.opensTime ? clockParts(instance.opensTime) : [0, 0]
    const opensAt = new Date(instance.periodStart.getTime() - leadMs)
    opensAt.setUTCHours(hours, minutes, 0, 0)
    opensAt.setTime(opensAt.getTime() - env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    if (Date.now() >= opensAt.getTime()) return
    const localNow = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    const opensDay = instance.periodStart.getTime() - leadMs
    const opensOnLaterDay = opensDay > Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
    if (opensOnLaterDay) {
        const day = new Date(opensDay).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
        throw AppError.badRequest(`This checklist opens on ${day}. You can see it early, but it can only be filled from then.`)
    }
    throw AppError.badRequest(`This checklist doesn't open until ${instance.opensTime}. Come back then.`)
}

export const assertInstanceEditable = (instance: { verificationStatus: string }, user: AccessTokenPayload) => {
    if (instance.verificationStatus === "APPROVED" && user.role !== "ADMIN") {
        throw AppError.forbidden("This checklist is approved and locked. Ask an admin to reopen it if something needs to change.")
    }
}

export const ANSWER_LABEL: Record<string, string> = { YES: "Yes", NO: "No" }
export const describeItemChange = (action: string, before: unknown, after: unknown): string => {
    const b = (before ?? {}) as Record<string, unknown>
    const a = (after ?? {}) as Record<string, unknown>
    if (action === "REOPEN") return "Reopened"
    if (a.isNotApplicable && !b.isNotApplicable) return "Marked not applicable"
    const parts: string[] = []
    if (action === "COMPLETE") parts.push("Marked done")
    if (a.booleanAnswer !== b.booleanAnswer && a.booleanAnswer) {
        const was = b.booleanAnswer ? ` (was ${ANSWER_LABEL[String(b.booleanAnswer)] ?? b.booleanAnswer})` : ""
        parts.push(`Answered ${ANSWER_LABEL[String(a.booleanAnswer)] ?? a.booleanAnswer}${was}`)
    }
    if (a.numericValue !== b.numericValue && a.numericValue != null) {
        parts.push(`Number ${b.numericValue != null ? `${b.numericValue} to ${a.numericValue}` : String(a.numericValue)}`)
    }
    if (a.textValue !== b.textValue && a.textValue) parts.push("Answer text changed")
    if (a.remarks !== b.remarks) parts.push(a.remarks ? "Remark added or edited" : "Remark removed")
    return parts.length ? parts.join(". ") : "Updated"
}

export const auditItemSnapshot = (item: Record<string, unknown>) => ({
    ...item,
    signatureValue: item.signatureValue ? "[signature]" : null,
    secondSignatureValue: item.secondSignatureValue ? "[signature]" : null,
    qrExpectedValue: undefined,
})

export const parentNotDeletedExpr = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

export const localNowExpr = localNowSql

export const deadlineExpr = runDeadlineSql

export const completionCondition = (status: InstanceStatusFilter) => {
    const anyItem = sql`EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id})`
    const anyUnfinished = sql`EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 0)`
    const complete = sql`${anyItem} AND NOT ${anyUnfinished}`
    const incomplete = sql`NOT ${anyItem} OR ${anyUnfinished}`

    if (status === "COMPLETED") return sql`(${complete})`
    if (status === "OVERDUE") return sql`((${incomplete}) AND ${deadlineExpr} <= ${localNowExpr})`
    if (status === "DUE") return sql`((${incomplete}) AND ${deadlineExpr} > ${localNowExpr})`
    return sql`(${incomplete})`
}

export const paginate = (page?: number, limit?: number) => {
    const safePage = Math.max(1, Math.trunc(page ?? 1) || 1)
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

export const DEFAULT_PAGE_SIZE = 50

export const buildMeta = (p: { page: number; limit: number }, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.limit)),
    hasNext: p.page * p.limit < total,
})

export const countInstances = async (where: SQL | undefined) => {
    const [row] = await db.select({ value: sql<number>`COUNT(*)` }).from(checklistInstances).where(where)
    return Number(row?.value ?? 0)
}

export const assertCanAccess = (instance: { assigneeIds: string[] }, user: AccessTokenPayload) => {
    const isAssignee = instance.assigneeIds.some((id) => id === user.sub)
    if (!isAdminOrPc(user.role) && !isAssignee) throw AppError.forbidden()
}

export const isHod = (user: { role: string }) => isDepartmentHeadRole(user.role)

export const getDepartmentIdsForUserIds = async (userIds: string[]): Promise<Set<string>> => {
    if (!userIds.length) return new Set()
    const rows = await db.select({ departmentId: users.departmentId }).from(users).where(inArray(users.id, userIds))
    return new Set(rows.map((r) => r.departmentId).filter((d): d is string => !!d))
}

export const assertCanView = async (instance: { assigneeIds: string[]; reviewerIds: string[] }, user: AccessTokenPayload) => {
    const isAssignee = instance.assigneeIds.some((id) => id === user.sub)
    if (isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER" || isAssignee || instance.reviewerIds.includes(user.sub)) return
    if (isHod(user) && user.departmentId) {
        const departmentIds = await getDepartmentIdsForUserIds(instance.assigneeIds)
        if (departmentIds.has(user.departmentId)) return
    }
    const covers = await approvalCoverService.activeCoversFor(user.sub)
    if (covers.length > 0) {
        const departmentIds = await getDepartmentIdsForUserIds(instance.assigneeIds)
        if (covers.some((cover) => coverCanVerify(cover, departmentIds, instance.reviewerIds))) return
    }
    throw AppError.forbidden()
}

export const actionsForAnswer = (item: ChecklistItem, answer: "YES" | "NO" | undefined): string[] => {
    if (answer === "YES") return item.yesActions ?? []
    if (answer === "NO") return item.noActions ?? []
    return []
}

export const isConditionTriggered = (item: ChecklistItem, values: ItemValueInput) =>
    actionsForAnswer(item, values.booleanAnswer).length > 0

export const assertConditionalActionsSatisfied = async (item: ChecklistItem, values: ItemValueInput) => {
    if (!isConditionTriggered(item, values)) return
    const actions: string[] = actionsForAnswer(item, values.booleanAnswer)

    if (actions.includes("REQUIRE_PHOTO")) {
        const images = await db.select().from(checklistInstanceImages).where(and(eq(checklistInstanceImages.checklistInstanceItemId, item.id), eq(checklistInstanceImages.purpose, conditionalPhotoPurposeFor(values.booleanAnswer as "YES" | "NO"))))
        const qualifying = item.requiresLivePhoto ? images.filter((img) => img.captureMethod === "LIVE").length : images.length
        if (qualifying < 1) {
            throw AppError.badRequest("Upload a photo before completing this item. Your answer requires one")
        }
    }

    if (actions.includes("ASK_REASON")) {
        const reason = values.conditionalReasonValue ?? item.conditionalReasonValue
        if (!reason?.trim()) {
            throw AppError.badRequest("Enter a reason before completing this item. Your answer requires one")
        }
    }
}

export const applyConditionalSideEffects = async (
    item: ChecklistItem,
    instance: { id: string; title: string; storeId: string },
    user: AccessTokenPayload,
    values: ItemValueInput,
    previousAnswer?: "YES" | "NO" | null,
) => {
    if (!isConditionTriggered(item, values)) return item
    const actions: string[] = actionsForAnswer(item, values.booleanAnswer)
    let updatedItem = item

    if (actions.includes("CREATE_ISSUE") && !item.issueId) {
        try {
            const reason = values.conditionalReasonValue ?? item.conditionalReasonValue
            const ticket = await ticketService.create({
                title: `Checklist flag : ${item.label}`.slice(0, 191),
                description: `Raised automatically from "${instance.title}" -- "${item.label}" was answered "${values.booleanAnswer}".${reason ? `Reason: ${reason}` : ""}`,
                storeId: instance.storeId,
            }, user, {
                inTransaction: async (tx, ticketId) => {
                    const [linked] = await tx.update(checklistInstanceItems).set({ issueId: ticketId, updatedAt: new Date() })
                        .where(and(eq(checklistInstanceItems.id, item.id), isNull(checklistInstanceItems.issueId)))
                    if (linked.affectedRows === 0) throw AppError.conflict("A ticket was already raised for this question.")
                },
            })
            if (!ticket) throw new Error("The ticket was not returned after it was created.")
            const issueId = String(ticket.id)
            updatedItem = { ...item, issueId }
        } catch (err) {
            console.error("Failed to auto-create issue from checklist flag:", err)
        }
    }

    const sameAnswerAgain = previousAnswer != null && previousAnswer === values.booleanAnswer
    if (actions.includes("NOTIFY_AREA_MANAGER") && !sameAnswerAgain) {
        await notificationService
            .notifyAreaManagersOfChecklistFlag({ _id: instance.id, title: instance.title }, updatedItem)
            .catch((err: unknown) => console.error("Failed to notify area manager of checklist flage:", err))
    }

    return updatedItem
}

export const deriveInstanceItemCompletion = (isDone: boolean, completedByUserId: string | null): { completedAt: Date | null; completedBy: string | null } => {
    if (!isDone) return { completedAt: null, completedBy: null }
    return { completedAt: new Date(), completedBy: completedByUserId }
}

export const syncVerificationStatus = async (instanceId: string) => {
    const [items, [instance]] = await Promise.all([
        db.select({ isDone: checklistInstanceItems.isDone }).from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, instanceId)),
        db.select().from(checklistInstances).where(eq(checklistInstances.id, instanceId)).limit(1),
    ])
    const allDone = items.length > 0 && items.every((i) => i.isDone)
    if (!instance) return

    if (allDone && !instance.completedFirstAt) {
        await db.update(checklistInstances).set({ completedFirstAt: new Date() }).where(eq(checklistInstances.id, instanceId))
    }

    if (!allDone && (instance.verificationStatus === "PENDING_APPROVAL" || instance.verificationStatus === "APPROVED")) {
        const missed = (await missedInstanceIds([instanceId])).size > 0
        await db.update(checklistInstances)
            .set({ verificationStatus: missed ? "REJECTED" : "NOT_SUBMITTED", submittedAt: null, submittedBy: null, approvalReminderSentAt: null, approvalEscalatedAt: null, updatedAt: new Date() })
            .where(eq(checklistInstances.id, instanceId))
    }
}

export const assertNotOwnRun = (assigneeLinks: { userId: string }[], user: AccessTokenPayload) => {
    if (user.role !== "ADMIN" && assigneeLinks.some((l) => l.userId === user.sub)) {
        throw AppError.forbidden("You fill this checklist in yourself, so you can't review it. Ask another reviewer.")
    }
}

export const assertCanVerify = async (assigneeDepartmentIds: Set<string>, reviewerIds: string[], user: AccessTokenPayload) => {
    if (reviewerIds.includes(user.sub)) return
    if (CAN_VERIFY_BY_ROLE[user.role]?.(assigneeDepartmentIds, user)) return
    const covers = await approvalCoverService.activeCoversFor(user.sub)
    if (covers.some((cover) => coverCanVerify(cover, assigneeDepartmentIds, reviewerIds))) return
    throw AppError.forbidden()
}

export const countsAgainstCompliance = (item: typeof checklistInstanceItems.$inferSelect): boolean => {
    if (item.isNotApplicable) return false
    if (item.sendBackCount > 0) return true
    if (!item.isDone) return false
    const accepted = item.acceptableAnswers ?? []
    switch (item.itemType) {
        case "YES_NO":
        case "PASS_FAIL":
            return accepted.length > 0 && item.booleanAnswer != null && !accepted.includes(item.booleanAnswer)
        case "MULTIPLE_CHOICE":
        case "DROPDOWN":
            return accepted.length > 0 && !!item.textValue && !accepted.includes(item.textValue)
        case "NUMBER_ENTRY":
        case "RATING": {
            const { acceptableMin: min, acceptableMax: max, numericValue: value } = item
            if ((min == null && max == null) || value == null) return false
            return (min != null && value < min) || (max != null && value > max)
        }
        default:
            return false
    }
}

export const loadWaivable = async (id: string, itemId: string, user: AccessTokenPayload) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    const assigneeIds = assigneeLinks.map((l) => l.userId)
    const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
    await assertCanVerify(await getDepartmentIdsForUserIds(assigneeIds), reviewerLinks.map((l) => l.userId), user)
    await assertCoordinatorRunReviewer(id, user)
    if (!["ADMIN", "PC", "MANAGER", "SENIOR"].includes(user.role)) throw AppError.forbidden("Only a department head, PC or Admin can waive a question.")
    if (assigneeIds.includes(user.sub)) throw AppError.forbidden("You cannot waive a question on a checklist you fill in yourself.")
    const orgWide = isAdminOrPc(user.role)
    if (!orgWide && instance.verificationStatus !== "PENDING_APPROVAL" && instance.verificationStatus !== "REJECTED") {
        throw AppError.badRequest("A question can only be waived while the checklist is being reviewed. Ask an admin.")
    }
    const [item] = await db.select().from(checklistInstanceItems).where(and(eq(checklistInstanceItems.id, itemId), eq(checklistInstanceItems.instanceId, id))).limit(1)
    if (!item) throw AppError.notFound("That question is not on this checklist.")
    return { instance: { ...instance, assigneeIds }, item }
}

export const DECISION_ACTIONS = ["APPROVE", "REJECT", "SEND_BACK", "SUBMIT"] as const
export const DECISIONS_MAX = 200
export type ChecklistDecision = {
    id: string
    instanceId: string
    title: string
    storeName: string | null
    action: (typeof DECISION_ACTIONS)[number]
    at: string
    actorName: string
    note: string | null
    itemCount: number | null
}

export type InstanceRecurrence = (typeof CHECKLIST_RECURRENCES)[number]
export type InstanceVerificationStatus = (typeof CHECKLIST_VERIFICATION_STATUSES)[number]

export type InstanceListFilter = {
    definitionId?: string
    storeId?: string
    status?: InstanceStatusFilter
    recurrence?: InstanceRecurrence
    verificationStatus?: InstanceVerificationStatus
    assigneeId?: string
    includeDeleted?: boolean
    assigneeIds?: string[]
    userId?: string
    hideEnded?: boolean
    departmentId?: string
    from?: string
    to?: string
}

export const instanceInDepartmentCondition = (departmentId: string): SQL => sql`EXISTS (
    SELECT 1 FROM ${checklistInstanceAssignees} a
    JOIN ${users} u ON u.id = a.userId
    WHERE a.instanceId = ${checklistInstances.id} AND u.departmentId = ${departmentId}
)`

export const SUMMARY_WINDOW_DAYS = 45
export const NOT_FINISHED_STATUSES: readonly InstanceStatusFilter[] = ["OPEN", "DUE", "OVERDUE"]

export const inWindowExpr = (now: Date = new Date()): SQL => {
    const windowStart = new Date(`${addDays(orgLocalDate(now), -SUMMARY_WINDOW_DAYS)}T00:00:00.000Z`)
    return sql`(${checklistInstances.recurrence} = 'ONE_TIME' OR ${checklistInstances.periodStart} >= ${utcSql(windowStart)})`
}

export const dayStartUtc = (day: string) => new Date(`${day}T00:00:00.000Z`)

export const instanceConditions = (filter: InstanceListFilter): SQL | undefined => {
    const conditions: SQL[] = filter.includeDeleted ? [] : [parentNotDeletedExpr]
    if (filter.definitionId) conditions.push(eq(checklistInstances.definitionId, filter.definitionId))
    if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
    if (filter.status) conditions.push(completionCondition(filter.status))
    if (filter.status && NOT_FINISHED_STATUSES.includes(filter.status) && !filter.from) conditions.push(inWindowExpr())
    if (filter.recurrence) conditions.push(eq(checklistInstances.recurrence, filter.recurrence))
    if (filter.verificationStatus) conditions.push(eq(checklistInstances.verificationStatus, filter.verificationStatus))
    if (filter.from) conditions.push(gte(checklistInstances.periodStart, dayStartUtc(asOrgDay(filter.from))))
    if (filter.to) conditions.push(lt(checklistInstances.periodStart, dayStartUtc(addDays(asOrgDay(filter.to), 1))))

    if (filter.userId) {
        conditions.push(sql`NOT (
            ${checklistInstances.verificationStatus} = 'NOT_SUBMITTED' AND ${checklistInstances.rejectionCount} = 0
            AND EXISTS (SELECT 1 FROM ${checklistDefinitions} pd WHERE pd.id = ${checklistInstances.definitionId} AND pd.isActive = false)
        )`)
    }

    const assigneeFilter = filter.assigneeId ?? filter.userId
    if (assigneeFilter) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} a
            WHERE a.instanceId = ${checklistInstances.id} AND a.userId = ${assigneeFilter}
        )`)
    }

    if (filter.assigneeIds?.length) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} a
            WHERE a.instanceId = ${checklistInstances.id}
            AND a.userId IN (${sql.join(filter.assigneeIds.map((id) => sql`${id}`), sql`, `)})
        )`)
    }

    if (filter.departmentId) conditions.push(instanceInDepartmentCondition(filter.departmentId))

    if (filter.userId && filter.hideEnded !== false) conditions.push(sql`NOT ${closedBeforeTodayExpr}`)

    return conditions.length ? and(...conditions) : undefined
}

export const pendingApprovalScope = async (user: AccessTokenPayload): Promise<SQL | undefined> => {
    if (user.role === "ADMIN") return undefined
    const covers = await approvalCoverService.activeCoversFor(user.sub)
    if (covers.some((cover) => cover.role === "ADMIN")) return undefined
    if (user.role === "PC" || covers.some((cover) => cover.role === "PC")) return sql`NOT ${coordinatorRunSql}`
    const reviewerIds = [user.sub, ...covers.map((cover) => cover.id)]
    const parts: SQL[] = [sql`EXISTS (
        SELECT 1 FROM ${checklistInstanceReviewers} r
        WHERE r.instanceId = ${checklistInstances.id} AND r.userId IN (${sql.join(reviewerIds.map((id) => sql`${id}`), sql`, `)})
    )`]
    const departmentIds = new Set<string>()
    if (isHod(user) && user.departmentId) departmentIds.add(user.departmentId)
    for (const cover of covers) if (isHod(cover) && cover.departmentId) departmentIds.add(cover.departmentId)
    for (const departmentId of departmentIds) parts.push(instanceInDepartmentCondition(departmentId))
    return sql`(${sql.join(parts, sql` OR `)})`
}

export const SUMMARY_TTL_SECONDS = 10
export const CHECKLIST_SUMMARY_PREFIX = "checklist-summary"

export const summaryOwnerKey = (userId: string | undefined) => `u:${userId ?? "org"}`

export const SUMMARY_VERSION_ALL = `${CHECKLIST_SUMMARY_PREFIX}:all`
export const summaryVersionOf = (owner: string) => `${CHECKLIST_SUMMARY_PREFIX}:${owner}`

export const dropChecklistSummaries = (assigneeIds: string[]) => {
    const namespaces = assigneeIds.length > 4
        ? [SUMMARY_VERSION_ALL]
        : [summaryOwnerKey(undefined), ...assigneeIds.map((id) => summaryOwnerKey(id))].map(summaryVersionOf)
    return Promise.all([bumpVersions(...namespaces), dropScoreCache()]).then(() => undefined)
}
