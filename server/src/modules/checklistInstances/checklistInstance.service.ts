import { conditionalPhotoPurposeFor, conditionalReasonPatch, stalePhotoPurposes } from "./booleanAnswerRules.js"
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
    stores,
    departments,
    auditLogs,
    holidays,
    CHECKLIST_RECURRENCES,
    CHECKLIST_VERIFICATION_STATUSES,
} from "../../db/schema/index.js"
import { groupBy } from "../../utils/groupBy.js"
import { assertPhotosSatisfied, VALUE_VALIDATORS_BY_ITEM_TYPE, type ChecklistItem, type ItemValueInput } from "./checklistItemValidators.js"
export type { ItemValueInput } from "./checklistItemValidators.js"
import { dropScoreCache } from "../scores/scoreCache.js"
import { eq, and, inArray, isNull, desc, asc, sql, gte, lte, lt, type SQL } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { notificationService } from "../notifications/notification.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { closedBeforeTodayExpr, missedInstanceIds, assertRunOpenForUser, localNowSql, runDeadlineSql } from "./checklistMissedRun.js"
import { canWorkEndedRun, hasRunDeadlinePassed, isRunEnded, runClosedMessage, runClosingMs, runDeadlineMs, runPhase } from "./checklistRunEnd.js"
import { auditService } from "../audit/audit.service.js"
import { cached, cacheKey, bumpVersions, versionTag } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { VerifyChecklistInstanceInput, RaiseChecklistTicketInput } from "./checklistInstance.validation.js"
import type { Role } from "../../db/schema/core.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { env } from "../../config/env.js"
import { checklistReportService, type ChecklistReportQuery } from "./checklistReport.service.js"
import { weightedGoodExpr, weightedScoredExpr, weightedGoodForDepartment, weightedScoredForDepartment, runSelect, runGroupBy, runFlagsOf, loadExtraDayAssignees } from "../checklistReports/checklistReport.service.js"
import type { ChecklistReportScope } from "./checklistReportScope.js"
import { orgLocalDate, addDays, utcSql, asOrgDay } from "./checklistReportRange.js"
import { hasExtraDay, isIdleHolidayRun, loadOffDayRules, type RunAssignee } from "../scores/offDayRules.js"
import { isRankable, metDeadlinePct, onTimeOfFinishedPct, pooledCompliancePct, runCompletionPct, tallyRuns, type RunOutcome } from "../scores/scoreFormulas.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { clockParts } from "../../utils/clock.js"

export type InstanceStatusFilter = "OPEN" | "DUE" | "COMPLETED" | "OVERDUE"

export type ChecklistPendingApprovalRow = {
    id: string
    title: string
    storeName: string | null
    waitingSince: string
}

const stripSecretItemFields = <T extends { qrExpectedValue?: string | null }>(item: T): T => ({ ...item, qrExpectedValue: null })

const hydrateInstances = async (instanceRows: (typeof checklistInstances.$inferSelect)[]) => {
    if (!instanceRows.length) return []
    const instanceIds = instanceRows.map((i) => i.id)

    const assigneeLinks = await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, instanceIds))
    const assigneeIdsByInstance = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        assigneeIdsByInstance.set(link.instanceId, list)
    }

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
            images: imagesByItem.get(item.id) ?? [],
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
            reviewerIds: reviewerIdsByInstance.get(instance.id) ?? [],
            submittedByName: instance.submittedBy ? (nameById.get(instance.submittedBy) ?? null) : null,
            items: runItems,
        }
    })
}

const sameStoredValue = (stored: unknown, incoming: unknown): boolean => {
    if (stored instanceof Date || incoming instanceof Date) {
        return stored instanceof Date && incoming instanceof Date && stored.getTime() === incoming.getTime()
    }
    return (stored ?? null) === (incoming ?? null)
}

const getPopulatedInstanceById = async (id: string) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) return null
    const [hydrated] = await hydrateInstances([instance])
    return hydrated
}

export const assertInstanceOpen = (instance: { opensTime: string | null; periodStart: Date }) => {
    const [hours, minutes] = instance.opensTime ? clockParts(instance.opensTime) : [0, 0]
    const opensAt = new Date(instance.periodStart)
    opensAt.setUTCHours(hours, minutes, 0, 0)
    opensAt.setTime(opensAt.getTime() - env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    if (Date.now() >= opensAt.getTime()) return
    const localNow = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    const opensOnLaterDay = instance.periodStart.getTime() > Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
    if (opensOnLaterDay) {
        const day = new Date(instance.periodStart).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
        throw AppError.badRequest(`This checklist opens on ${day}. You can see it early, but it can only be filled from then.`)
    }
    throw AppError.badRequest(`This checklist doesn't open until ${instance.opensTime}. Come back then.`)
}

export const assertInstanceEditable = (instance: { verificationStatus: string }, user: AccessTokenPayload) => {
    if (instance.verificationStatus === "APPROVED" && user.role !== "ADMIN") {
        throw AppError.forbidden("This checklist is approved and locked. Ask an admin to reopen it if something needs to change.")
    }
}

const ANSWER_LABEL: Record<string, string> = { YES: "Yes", NO: "No" }
const describeItemChange = (action: string, before: unknown, after: unknown): string => {
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

const auditItemSnapshot = (item: Record<string, unknown>) => ({
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

const completionCondition = (status: InstanceStatusFilter) => {
    const anyItem = sql`EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id})`
    const anyUnfinished = sql`EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 0)`
    const complete = sql`${anyItem} AND NOT ${anyUnfinished}`
    const incomplete = sql`NOT ${anyItem} OR ${anyUnfinished}`

    if (status === "COMPLETED") return sql`(${complete})`
    if (status === "OVERDUE") return sql`((${incomplete}) AND ${deadlineExpr} <= ${localNowExpr})`
    if (status === "DUE") return sql`((${incomplete}) AND ${deadlineExpr} > ${localNowExpr})`
    return sql`(${incomplete})`
}

const paginate = (page?: number, limit?: number) => {
    const safePage = Math.max(1, Math.trunc(page ?? 1) || 1)
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

const DEFAULT_PAGE_SIZE = 50

const buildMeta = (p: { page: number; limit: number }, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.limit)),
    hasNext: p.page * p.limit < total,
})

const countInstances = async (where: SQL | undefined) => {
    const [row] = await db.select({ value: sql<number>`COUNT(*)` }).from(checklistInstances).where(where)
    return Number(row?.value ?? 0)
}

const assertCanAccess = (instance: { assigneeIds: string[] }, user: AccessTokenPayload) => {
    const isAssignee = instance.assigneeIds.some((id) => id === user.sub)
    if (!isAdminOrPc(user.role) && !isAssignee) throw AppError.forbidden()
}

export const isHod = (user: { role: string }) => isDepartmentHeadRole(user.role)

const getDepartmentIdsForUserIds = async (userIds: string[]): Promise<Set<string>> => {
    if (!userIds.length) return new Set()
    const rows = await db.select({ departmentId: users.departmentId }).from(users).where(inArray(users.id, userIds))
    return new Set(rows.map((r) => r.departmentId).filter((d): d is string => !!d))
}

const assertCanView = async (instance: { assigneeIds: string[]; reviewerIds: string[] }, user: AccessTokenPayload) => {
    const isAssignee = instance.assigneeIds.some((id) => id === user.sub)
    if (isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER" || isAssignee || instance.reviewerIds.includes(user.sub)) return
    if (isHod(user) && user.departmentId) {
        const departmentIds = await getDepartmentIdsForUserIds(instance.assigneeIds)
        if (departmentIds.has(user.departmentId)) return
    }
    throw AppError.forbidden()
}

const actionsForAnswer = (item: ChecklistItem, answer: "YES" | "NO" | undefined): string[] => {
    if (answer === "YES") return item.yesActions ?? []
    if (answer === "NO") return item.noActions ?? []
    return []
}

const isConditionTriggered = (item: ChecklistItem, values: ItemValueInput) =>
    actionsForAnswer(item, values.booleanAnswer).length > 0

const assertConditionalActionsSatisfied = async (item: ChecklistItem, values: ItemValueInput) => {
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

const applyConditionalSideEffects = async (
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

const deriveInstanceItemCompletion = (isDone: boolean, completedByUserId: string | null): { completedAt: Date | null; completedBy: string | null } => {
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

const CAN_VERIFY_BY_ROLE: Partial<Record<Role, (assigneeDepartmentIds: Set<string>, user: AccessTokenPayload) => boolean>> = {
    ADMIN: () => true,
    PC: () => true,
    MANAGER: (assigneeDepartmentIds, user) => !!user.departmentId && assigneeDepartmentIds.has(user.departmentId),
    SENIOR: (assigneeDepartmentIds, user) => !!user.departmentId && assigneeDepartmentIds.has(user.departmentId),
}

const assertNotOwnRun = (assigneeLinks: { userId: string }[], user: AccessTokenPayload) => {
    if (user.role !== "ADMIN" && assigneeLinks.some((l) => l.userId === user.sub)) {
        throw AppError.forbidden("You fill this checklist in yourself, so you can't review it. Ask another reviewer.")
    }
}

const assertCanVerify = (assigneeDepartmentIds: Set<string>, reviewerIds: string[], user: AccessTokenPayload) => {
    if (reviewerIds.includes(user.sub)) return
    const canVerify = CAN_VERIFY_BY_ROLE[user.role]?.(assigneeDepartmentIds, user) ?? false
    if (!canVerify) throw AppError.forbidden()
}

const countsAgainstCompliance = (item: typeof checklistInstanceItems.$inferSelect): boolean => {
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

const loadWaivable = async (id: string, itemId: string, user: AccessTokenPayload) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) throw AppError.notFound("Checklist instance not found")
    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
    const assigneeIds = assigneeLinks.map((l) => l.userId)
    const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
    assertCanVerify(await getDepartmentIdsForUserIds(assigneeIds), reviewerLinks.map((l) => l.userId), user)
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

const DECISION_ACTIONS = ["APPROVE", "REJECT", "SEND_BACK", "SUBMIT"] as const
const DECISIONS_MAX = 200
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

const SUMMARY_WINDOW_DAYS = 45
const NOT_FINISHED_STATUSES: readonly InstanceStatusFilter[] = ["OPEN", "DUE", "OVERDUE"]

const inWindowExpr = (now: Date = new Date()): SQL => {
    const windowStart = new Date(`${addDays(orgLocalDate(now), -SUMMARY_WINDOW_DAYS)}T00:00:00.000Z`)
    return sql`(${checklistInstances.recurrence} = 'ONE_TIME' OR ${checklistInstances.periodStart} >= ${utcSql(windowStart)})`
}

const dayStartUtc = (day: string) => new Date(`${day}T00:00:00.000Z`)

const instanceConditions = (filter: InstanceListFilter): SQL | undefined => {
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

export const pendingApprovalScope = (user: AccessTokenPayload): SQL | undefined => {
    if (isAdminOrPc(user.role)) return undefined
    const parts: SQL[] = [sql`EXISTS (
        SELECT 1 FROM ${checklistInstanceReviewers} r
        WHERE r.instanceId = ${checklistInstances.id} AND r.userId = ${user.sub}
    )`]
    if (isHod(user) && user.departmentId) parts.push(instanceInDepartmentCondition(user.departmentId))
    return sql`(${sql.join(parts, sql` OR `)})`
}

const SUMMARY_TTL_SECONDS = 10
const CHECKLIST_SUMMARY_PREFIX = "checklist-summary"

const summaryOwnerKey = (userId: string | undefined) => `u:${userId ?? "org"}`

const SUMMARY_VERSION_ALL = `${CHECKLIST_SUMMARY_PREFIX}:all`
const summaryVersionOf = (owner: string) => `${CHECKLIST_SUMMARY_PREFIX}:${owner}`

export const dropChecklistSummaries = (assigneeIds: string[]) => {
    const namespaces = assigneeIds.length > 4
        ? [SUMMARY_VERSION_ALL]
        : [summaryOwnerKey(undefined), ...assigneeIds.map((id) => summaryOwnerKey(id))].map(summaryVersionOf)
    return Promise.all([bumpVersions(...namespaces), dropScoreCache()]).then(() => undefined)
}

export const checklistInstanceService = {
    async getMine(userId: string, options: {
        status?: InstanceStatusFilter
        page?: number
        limit?: number
        storeId?: string
        recurrence?: InstanceRecurrence
        verificationStatus?: InstanceVerificationStatus
        departmentId?: string
        assigneeIds?: string[]
        includeDeleted?: boolean
        from?: string
        to?: string
        hideEnded?: boolean
    } = {}) {
        const { status, page, limit, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to, hideEnded } = options
        const p = paginate(page, limit)
        const where = instanceConditions({ userId, status, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to, hideEnded })

        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
            .limit(p.limit).offset(p.offset)

        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    async getMyFocus(userId: string, options: { hideEnded: boolean }) {
        const base = { includeDeleted: false, hideEnded: options.hideEnded }
        const [sentBack, overdue, unsent, due, recent] = await Promise.all([
            this.getMine(userId, { ...base, verificationStatus: "REJECTED", limit: 50 }),
            this.getMine(userId, { ...base, status: "OVERDUE", limit: 50 }),
            this.getMine(userId, { ...base, status: "COMPLETED", verificationStatus: "NOT_SUBMITTED", limit: 50 }),
            this.getMine(userId, { ...base, status: "DUE", limit: 50 }),
            this.getMine(userId, { ...base, limit: 25 }),
        ])
        const byId = new Map<string, (typeof recent.data)[number]>()
        for (const list of [sentBack, overdue, unsent, due, recent]) for (const row of list.data) byId.set(row.id, row)
        return [...byId.values()]
    },

    async listAll(filter: InstanceListFilter & { page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        const where = instanceConditions(filter)
        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
            .limit(p.limit).offset(p.offset)

        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    async summary(filter: InstanceListFilter) {
        const today = orgLocalDate(new Date())
        const fromDay = filter.from ? asOrgDay(filter.from) : `${today.slice(0, 8)}01`
        const toDay = filter.to ? asOrgDay(filter.to) : today
        const windowed: InstanceListFilter = { ...filter, from: fromDay, to: toDay }
        const owner = summaryOwnerKey(filter.userId)
        const version = await versionTag(SUMMARY_VERSION_ALL, summaryVersionOf(owner))
        return cached(
            cacheKey(
                CHECKLIST_SUMMARY_PREFIX, owner, `v${version}`, filter.includeDeleted ? "deleted" : "live", filter.hideEnded === false ? "all-ends" : "open-ends",
                filter.storeId, filter.assigneeId, filter.assigneeIds?.join(","), filter.definitionId, filter.status,
                filter.departmentId, filter.recurrence, filter.verificationStatus, fromDay, toDay,
            ),
            SUMMARY_TTL_SECONDS,
            async () => {
                const built = instanceConditions(windowed)
                const now = new Date()
                const offDayRules = await loadOffDayRules(fromDay, toDay)

                const runRows = await db.select(runSelect)
                    .from(checklistInstances)
                    .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
                    .where(built)
                    .groupBy(...runGroupBy)
                const assigneesByRun = await loadExtraDayAssignees(runRows, offDayRules)
                const flagCtx = { offDayRules, assigneesByRun, offsetMs: env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000, now: now.getTime() }
                const flags = runRows.map((r) => runFlagsOf(r, flagCtx))
                const counted = flags.filter((f) => !f.skip)
                const completed = counted.filter((f) => f.complete).length
                const missed = counted.filter((f) => !f.complete && f.missed).length
                const onTrack = counted.length - completed - missed
                const dueRuns = completed + missed

                const [fresh] = await db.select({ newToday: sql<number>`SUM(CASE WHEN ${checklistInstances.generatedAt} >= ${utcSql(orgDayStartUtc(now))} THEN 1 ELSE 0 END)` })
                    .from(checklistInstances).where(built)

                const [items] = await db.select({
                    totalItems: sql<number>`COUNT(*)`,
                    doneItems: sql<number>`SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END)`,
                })
                    .from(checklistInstanceItems)
                    .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                    .where(built)

                return {
                    total: runRows.length,
                    completed,
                    pending: missed + onTrack,
                    due: onTrack,
                    overdue: missed,
                    missed,
                    dueRuns,
                    completionPct: runCompletionPct({ completed, due: dueRuns }),
                    notCounted: flags.length - counted.length,
                    olderOpen: 0,
                    totalItems: Number(items?.totalItems ?? 0),
                    doneItems: Number(items?.doneItems ?? 0),
                    newToday: Number(fresh?.newToday ?? 0),
                    window: { from: fromDay, to: toDay, asOf: now.toISOString() },
                }
            },
        )
    },

    async auditHistory(user: AccessTokenPayload, filter: { from?: string; to?: string; storeId?: string; personId?: string; page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        const conditions = [eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr]
        if (filter.personId) conditions.push(eq(checklistInstanceItemSubmissions.userId, filter.personId))
        if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
        if (filter.from) conditions.push(gte(checklistInstances.periodStart, dayStartUtc(asOrgDay(filter.from))))
        if (filter.to) conditions.push(lt(checklistInstances.periodStart, dayStartUtc(addDays(asOrgDay(filter.to), 1))))
        if (!isAdminOrPc(user.role)) {
            if (!isHod(user) || !user.departmentId) return { data: [], meta: buildMeta(p, 0) }
            conditions.push(eq(users.departmentId, user.departmentId))
        }
        const where = and(...conditions)

        const [countRow] = await db.select({ n: sql<number>`COUNT(*)` })
            .from(checklistInstanceItemSubmissions)
            .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
            .innerJoin(users, eq(users.id, checklistInstanceItemSubmissions.userId))
            .where(where)
        const total = Number(countRow?.n ?? 0)

        const rows = await db.select({
            id: checklistInstanceItemSubmissions.id,
            remarks: checklistInstanceItemSubmissions.remarks,
            isNotApplicable: checklistInstanceItemSubmissions.isNotApplicable,
            completedAt: checklistInstanceItemSubmissions.completedAt,
            itemLabel: checklistInstanceItems.label,
            checklistTitle: checklistInstances.title,
            periodStart: checklistInstances.periodStart,
            storeId: checklistInstances.storeId,
            storeName: stores.name,
            personFirstName: users.firstName,
            personLastName: users.lastName,
            personIsActive: users.isActive,
        })
            .from(checklistInstanceItemSubmissions)
            .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
            .innerJoin(users, eq(users.id, checklistInstanceItemSubmissions.userId))
            .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
            .where(where)
            .orderBy(desc(checklistInstanceItemSubmissions.completedAt), asc(checklistInstanceItemSubmissions.id))
            .limit(p.limit).offset(p.offset)
        if (!rows.length) return { data: [], meta: buildMeta(p, total) }

        const submissionIds = rows.map((r) => r.id)
        const accessories = await db.select().from(checklistInstanceItemSubmissionAccessories)
            .where(inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds))
            .orderBy(asc(checklistInstanceItemSubmissionAccessories.createdAt), asc(checklistInstanceItemSubmissionAccessories.id))
        const images = await db.select().from(checklistInstanceItemSubmissionImages)
            .where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds))
            .orderBy(asc(checklistInstanceItemSubmissionImages.createdAt), asc(checklistInstanceItemSubmissionImages.id))

        const data = rows.map((r) => ({
            ...r,
            accessories: accessories.filter((a) => a.submissionId === r.id).map((a) => ({ name: a.name, checked: a.checked })),
            images: images.filter((img) => img.submissionId === r.id).map((img) => ({
                id: img.id,
                url: img.url,
                originalFilename: img.originalFilename,
                captureMethod: img.captureMethod,
                createdAt: img.createdAt,
            })),
        }))
        return { data, meta: buildMeta(p, total) }
    },

    async formerPeople() {
        const people = await db.select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            departmentName: departments.name,
            storeName: stores.name,
            updatedAt: users.updatedAt,
            deactivatedAt: users.deactivatedAt,
        })
            .from(users)
            .leftJoin(departments, eq(departments.id, users.departmentId))
            .leftJoin(stores, eq(stores.id, users.storeId))
            .where(eq(users.isActive, false))
        if (!people.length) return []
        const ids = people.map((p) => p.id)

        const [worked, assigned, audited, left] = await Promise.all([
            db.select({ userId: checklistInstanceItems.completedBy, n: sql<number>`COUNT(DISTINCT ${checklistInstanceItems.instanceId})` })
                .from(checklistInstanceItems)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                .where(and(inArray(checklistInstanceItems.completedBy, ids), parentNotDeletedExpr))
                .groupBy(checklistInstanceItems.completedBy),
            db.select({ userId: checklistInstanceAssignees.userId, n: sql<number>`COUNT(DISTINCT ${checklistInstanceAssignees.instanceId})` })
                .from(checklistInstanceAssignees)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
                .where(and(inArray(checklistInstanceAssignees.userId, ids), parentNotDeletedExpr))
                .groupBy(checklistInstanceAssignees.userId),
            db.select({ userId: checklistInstanceItemSubmissions.userId, n: sql<number>`COUNT(*)` })
                .from(checklistInstanceItemSubmissions)
                .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                .where(and(inArray(checklistInstanceItemSubmissions.userId, ids), eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr))
                .groupBy(checklistInstanceItemSubmissions.userId),
            db.select({ userId: auditLogs.entityId, at: sql<Date>`MAX(${auditLogs.createdAt})`.mapWith(auditLogs.createdAt) })
                .from(auditLogs).where(and(eq(auditLogs.entityType, "User"), eq(auditLogs.action, "OFFBOARD"), inArray(auditLogs.entityId, ids)))
                .groupBy(auditLogs.entityId),
        ])
        const count = (rows: { userId: string | null; n: number }[]) => new Map(rows.map((r) => [r.userId, Number(r.n)]))
        const workedBy = count(worked), assignedBy = count(assigned), auditedBy = count(audited)
        const leftBy = new Map(left.map((r) => [r.userId, r.at]))

        return people.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            role: p.role,
            departmentName: p.departmentName,
            storeName: p.storeName,
            leftAt: p.deactivatedAt ?? leftBy.get(p.id) ?? p.updatedAt,
            runsAssigned: assignedBy.get(p.id) ?? 0,
            runsWorked: workedBy.get(p.id) ?? 0,
            auditsOnThem: auditedBy.get(p.id) ?? 0,
        })).sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime())
    },

    async formerPeopleNames() {
        return db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(eq(users.isActive, false))
            .orderBy(asc(users.firstName), asc(users.lastName))
    },

    async personRuns(personId: string, filter: { page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        const mine = sql`(
            ${checklistInstances.id} IN (SELECT a.instanceId FROM ${checklistInstanceAssignees} a WHERE a.userId = ${personId})
            OR ${checklistInstances.id} IN (SELECT i.instanceId FROM ${checklistInstanceItems} i WHERE i.completedBy = ${personId})
        )`
        const where = and(mine, parentNotDeletedExpr)

        const [countRow] = await db.select({ n: sql<number>`COUNT(*)` }).from(checklistInstances).where(where)
        const total = Number(countRow?.n ?? 0)

        const rows = await db.select({
            id: checklistInstances.id,
            title: checklistInstances.title,
            storeName: stores.name,
            periodStart: checklistInstances.periodStart,
            verificationStatus: checklistInstances.verificationStatus,
            total: sql<number>`COUNT(${checklistInstanceItems.id})`,
            done: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
            theirs: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstanceItems.completedBy} = ${personId} THEN 1 ELSE 0 END), 0)`,
        })
            .from(checklistInstances)
            .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
            .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
            .where(where)
            .groupBy(checklistInstances.id, checklistInstances.title, stores.name, checklistInstances.periodStart, checklistInstances.verificationStatus)
            .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
            .limit(p.limit).offset(p.offset)

        return {
            data: rows.map((r) => ({ ...r, total: Number(r.total), done: Number(r.done), theirs: Number(r.theirs) })),
            meta: buildMeta(p, total),
        }
    },

    async periodReport(user: AccessTokenPayload, from: string, to: string, storeId?: string, departmentId?: string) {
        const DAY = 86_400_000
        const startMs = Date.parse(`${from}T00:00:00.000Z`)
        const endMs = Date.parse(`${to}T00:00:00.000Z`)
        const spanDays = Math.round((endMs - startMs) / DAY) + 1
        const kind: "day" | "month" = spanDays <= 31 ? "day" : "month"
        const dayKeys = Array.from({ length: spanDays }, (_, i) => new Date(startMs + i * DAY).toISOString().slice(0, 10))
        const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        const columns: { key: string; label: string }[] = []
        if (kind === "day") {
            for (const d of dayKeys) columns.push({ key: d, label: d })
        } else {
            const seen = new Set<string>()
            for (const d of dayKeys) {
                const key = d.slice(0, 7)
                if (seen.has(key)) continue
                seen.add(key)
                columns.push({ key, label: `${MONTHS[Number(key.slice(5, 7)) - 1]}${key.slice(0, 4) !== from.slice(0, 4) || spanDays > 366 ? ` ${key.slice(2, 4)}` : ""}` })
            }
        }
        type Figures = {
            due: number
            completed: number
            onTime: number
            late: number
            missed: number
            open: number
            rate: number | null
            completion: number | null
            compliance: number | null
            onTimeOfFinishedPct: number | null
            metDeadlinePct: number | null
            rankable: boolean
        }
        const figuresOf = (outcomes: Iterable<RunOutcome>, good: number, scored: number): Figures => {
            const t = tallyRuns(outcomes)
            const metDeadline = metDeadlinePct(t.onTime, t.due)
            return {
                due: t.due, completed: t.completed, onTime: t.onTime, late: t.completed - t.onTime, missed: t.missed, open: t.open,
                rate: metDeadline,
                completion: runCompletionPct(t),
                compliance: pooledCompliancePct([{ weightedGood: good, weightedScored: scored }]),
                onTimeOfFinishedPct: onTimeOfFinishedPct(t.onTime, t.completed),
                metDeadlinePct: metDeadline,
                rankable: isRankable(t.due),
            }
        }
        const emptySummary: Figures = figuresOf([], 0, 0)
        const empty = {
            from, to, weekStart: from, kind, columns, days: kind === "day" ? dayKeys : ([] as string[]),
            holidays: {} as Record<string, string>, rows: [], summary: emptySummary,
            byStore: [] as (Figures & { storeId: string; storeName: string })[],
        }

        const conditions = [
            eq(checklistInstances.recurrence, "DAILY"),
            gte(checklistInstances.periodStart, new Date(startMs)),
            lte(checklistInstances.periodStart, new Date(endMs)),
            parentNotDeletedExpr,
        ]
        if (storeId) conditions.push(eq(checklistInstances.storeId, storeId))
        if (!isAdminOrPc(user.role)) {
            if (!isHod(user) || !user.departmentId) return empty
            conditions.push(instanceInDepartmentCondition(user.departmentId))
        } else if (departmentId) {
            conditions.push(instanceInDepartmentCondition(departmentId))
        }

        const headDepartmentId = (!isAdminOrPc(user.role) ? user.departmentId : departmentId) || undefined

        const runs = await db.select({
            id: checklistInstances.id,
            definitionId: checklistInstances.definitionId,
            title: checklistInstances.title,
            storeId: checklistInstances.storeId,
            scopeKey: checklistInstances.scopeKey,
            periodStart: checklistInstances.periodStart,
            periodEnd: checklistInstances.periodEnd,
            cutoffTime: checklistInstances.cutoffTime,
            opensTime: checklistInstances.opensTime,
            total: sql<number>`COUNT(${checklistInstanceItems.id})`,
            done: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
            lastDoneAt: sql<Date | null>`MAX(${checklistInstanceItems.completedAt})`.mapWith(checklistInstanceItems.completedAt),
            completedFirstAt: checklistInstances.completedFirstAt,
            wScored: headDepartmentId ? weightedScoredForDepartment(headDepartmentId) : weightedScoredExpr,
            wGood: headDepartmentId ? weightedGoodForDepartment(headDepartmentId) : weightedGoodExpr,
        })
            .from(checklistInstances)
            .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
            .where(and(...conditions))
            .groupBy(
                checklistInstances.id, checklistInstances.definitionId, checklistInstances.title, checklistInstances.storeId, checklistInstances.scopeKey,
                checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime, checklistInstances.opensTime,
                checklistInstances.completedFirstAt,
            )
        if (!runs.length) return empty

        const holidayRows = await db.select({ date: holidays.date, name: holidays.name }).from(holidays).where(inArray(holidays.date, dayKeys))
        const holidayByDate = Object.fromEntries(holidayRows.map((h) => [h.date, h.name]))
        const offDayRules = await loadOffDayRules(from, to)
        const extraDayRunIds = runs.filter((r) => hasExtraDay(offDayRules, r.periodStart.toISOString().slice(0, 10))).map((r) => r.id)
        const assigneesByRun = new Map<string, RunAssignee[]>()
        if (extraDayRunIds.length) {
            const assigneeRows = await db
                .select({ instanceId: checklistInstanceAssignees.instanceId, id: users.id, departmentId: users.departmentId, storeId: users.storeId })
                .from(checklistInstanceAssignees)
                .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
                .where(inArray(checklistInstanceAssignees.instanceId, extraDayRunIds))
            for (const a of assigneeRows) {
                const list = assigneesByRun.get(a.instanceId)
                const entry = { id: a.id, departmentId: a.departmentId, storeId: a.storeId }
                if (list) list.push(entry)
                else assigneesByRun.set(a.instanceId, [entry])
            }
        }
        const storeIds = [...new Set(runs.map((r) => r.storeId))]
        const storeNames = new Map((await db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds))).map((s) => [s.id, s.name]))

        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const now = Date.now()
        const today = new Date(now + offsetMs).toISOString().slice(0, 10)
        const deadlineOf = (r: { periodStart: Date; periodEnd: Date; cutoffTime: string | null; opensTime: string | null }) =>
            runDeadlineMs(r, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)

        type CellState = "done" | "late" | "missed" | "open" | "holiday" | "off" | "upcoming" | "summary"
        type Run = typeof runs[number]
        const stateOf = (r: Run): "done" | "late" | "missed" | "open" => {
            const total = Number(r.total), done = Number(r.done)
            const complete = total > 0 && done === total
            const deadline = deadlineOf(r)
            const doneAt = r.completedFirstAt ?? r.lastDoneAt
            if (complete) return doneAt && doneAt.getTime() > deadline ? "late" : "done"
            return now >= deadline ? "missed" : "open"
        }
        const pctOf = (good: number, scored: number) => pooledCompliancePct([{ weightedGood: good, weightedScored: scored }])
        const outcomeOf = (r: Run): RunOutcome => {
            const st = stateOf(r)
            return { id: r.id, complete: st === "done" || st === "late", onTime: st === "done", missed: st === "missed" }
        }

        const opensAtOf = (r: Run) => {
            let at = r.periodStart.getTime() - offsetMs
            if (r.opensTime) {
                const [oh, om] = clockParts(r.opensTime)
                at += (oh * 60 + om) * 60_000
            }
            return at
        }
        const countable = runs.filter((r) => {
            const total = Number(r.total), done = Number(r.done)
            if (total === 0) return false
            const date = r.periodStart.toISOString().slice(0, 10)
            if (isIdleHolidayRun(offDayRules, { date, recurrence: "DAILY", complete: done === total, storeId: r.storeId }, hasExtraDay(offDayRules, date) ? assigneesByRun.get(r.id) ?? [] : [])) return false
            if (done === 0 && opensAtOf(r) > now) return false
            return true
        })

        type Group = { definitionId: string; scopeKey: string; name: string; storeId: string; runs: Run[] }
        const grouped = new Map<string, Group>()
        for (const r of countable) {
            const key = `${r.definitionId}|${r.storeId}|${r.scopeKey}`
            const g = grouped.get(key) ?? { definitionId: r.definitionId, scopeKey: r.scopeKey, name: r.title, storeId: r.storeId, runs: [] }
            g.runs.push(r)
            g.name = r.title
            grouped.set(key, g)
        }

        type Tally = { outcomes: RunOutcome[]; scored: number; good: number }
        const newTally = (): Tally => ({ outcomes: [], scored: 0, good: 0 })
        const addRun = (t: Tally, r: Run) => {
            t.outcomes.push(outcomeOf(r))
            t.scored += Number(r.wScored)
            t.good += Number(r.wGood)
        }
        const figuresOfTally = (t: Tally | undefined): Figures => figuresOf(t?.outcomes ?? [], t?.good ?? 0, t?.scored ?? 0)
        const totals = newTally()
        const storeTotals = new Map<string, Tally>()
        const rows = [...grouped.values()].map((g) => {
            const acc = newTally()
            const byDay = new Map<string, Run>()
            const byMonth = new Map<string, Tally>()
            const store = storeTotals.get(g.storeId) ?? newTally()
            storeTotals.set(g.storeId, store)
            for (const r of g.runs) {
                const date = r.periodStart.toISOString().slice(0, 10)
                byDay.set(date, r)
                const month = byMonth.get(date.slice(0, 7)) ?? newTally()
                byMonth.set(date.slice(0, 7), month)
                for (const t of [acc, month, store, totals]) addRun(t, r)
            }

            const cells = columns.map((col) => {
                if (kind === "month") {
                    return { date: col.key, state: "summary" as CellState, runId: null as string | null, done: 0, total: 0, ...figuresOfTally(byMonth.get(col.key)) }
                }
                const date = col.key
                const r = byDay.get(date)
                if (!r) {
                    const state: CellState = holidayByDate[date] ? "holiday" : date >= today ? "upcoming" : "off"
                    return { date, state, runId: null as string | null, done: 0, total: 0, compliance: null as number | null }
                }
                return { date, state: stateOf(r) as CellState, runId: r.id, done: Number(r.done), total: Number(r.total), compliance: pctOf(Number(r.wGood), Number(r.wScored)) }
            })
            return {
                definitionId: g.definitionId,
                scopeKey: g.scopeKey,
                name: g.name,
                storeId: g.storeId,
                storeName: storeNames.get(g.storeId) ?? "Store",
                cells,
                ...figuresOfTally(acc),
            }
        }).sort((a, b) => a.name.localeCompare(b.name) || a.storeName.localeCompare(b.storeName))

        return {
            from,
            to,
            weekStart: from,
            kind,
            columns,
            days: kind === "day" ? dayKeys : ([] as string[]),
            holidays: holidayByDate,
            rows,
            byStore: [...storeTotals.entries()].map(([id, t]) => ({ storeId: id, storeName: storeNames.get(id) ?? "Store", ...figuresOfTally(t) })),
            summary: figuresOfTally(totals),
        }
    },

    async periodDepartmentScores(user: AccessTokenPayload, from: string, to: string, storeId?: string) {
        const isOrgWide = isAdminOrPc(user.role)
        const list = await db.select({ id: departments.id, name: departments.name }).from(departments)
            .where(isOrgWide ? undefined : eq(departments.id, user.departmentId ?? ""))
            .orderBy(asc(departments.name))
        const reports = await Promise.all(list.map((dep) => this.periodReport(user, from, to, storeId, dep.id)))
        return list.map((dep, i) => ({ departmentId: dep.id, departmentName: dep.name, ...reports[i]?.summary }))
    },

    async itemHistory(id: string, user: AccessTokenPayload) {
        const instance = await getPopulatedInstanceById(id)
        if (!instance) throw AppError.notFound("Checklist instance not found")
        await assertCanView(instance, user)
        const oversees = isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER" || isHod(user) || instance.reviewerIds.includes(user.sub)
        if (!oversees) throw AppError.forbidden()

        const itemIds = instance.items.map((item) => item.id)
        if (itemIds.length === 0) return []
        const rows = await db
            .select()
            .from(auditLogs)
            .where(and(eq(auditLogs.entityType, "ChecklistInstanceItem"), inArray(auditLogs.entityId, itemIds)))
            .orderBy(asc(auditLogs.createdAt))

        return rows.map((row) => ({
            id: row.id,
            itemId: row.entityId,
            at: row.createdAt,
            actorName: row.actorName ?? "Someone",
            source: row.source,
            summary: describeItemChange(row.action, row.before, row.after),
        }))
    },

    async getById(id: string, user: AccessTokenPayload) {
        const instance = await getPopulatedInstanceById(id)
        if (!instance) throw AppError.notFound("Checklist instance not found")
        await assertCanView(instance, user)
        return instance
    },

    async setItemDone(itemId: string, isDone: boolean, user: AccessTokenPayload, values: ItemValueInput = {}) {
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
    },

    async listPendingVerification(user: AccessTokenPayload, page?: number, limit?: number) {
        const p = paginate(page, limit)
        const conditions: SQL[] = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]

        const scope = pendingApprovalScope(user)
        if (scope) conditions.push(scope)

        const where = and(...conditions)
        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(asc(checklistInstances.updatedAt), asc(checklistInstances.id))
            .limit(p.limit).offset(p.offset)
        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    async pendingApprovalPreview(user: AccessTokenPayload, limit = 8): Promise<{ data: ChecklistPendingApprovalRow[]; meta: { total: number } }> {
        const conditions: SQL[] = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]
        const scope = pendingApprovalScope(user)
        if (scope) conditions.push(scope)
        const where = and(...conditions)

        const [total, rows] = await Promise.all([
            countInstances(where),
            db.select({
                id: checklistInstances.id,
                title: checklistInstances.title,
                storeName: stores.name,
                updatedAt: checklistInstances.updatedAt,
            })
                .from(checklistInstances)
                .leftJoin(stores, eq(checklistInstances.storeId, stores.id))
                .where(where)
                .orderBy(asc(checklistInstances.updatedAt))
                .limit(limit),
        ])

        return {
            data: rows.map((r) => ({
                id: r.id,
                title: r.title,
                storeName: r.storeName ?? null,
                waitingSince: r.updatedAt.toISOString(),
            })),
            meta: { total },
        }
    },

    async submit(id: string, user: AccessTokenPayload) {
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
    },

    async sendBack(id: string, input: { itemIds: string[]; note: string }, user: AccessTokenPayload) {
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
    },

    async raiseTicket(id: string, itemId: string, input: RaiseChecklistTicketInput, user: AccessTokenPayload) {
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
    },

    async waiveItem(id: string, itemId: string, input: { reason: string }, user: AccessTokenPayload) {
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
    },

    async unwaiveItem(id: string, itemId: string, user: AccessTokenPayload) {
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
    },

    async verify(id: string, input: VerifyChecklistInstanceInput, user: AccessTokenPayload) {
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
    },

    async reopenApproval(id: string, user: AccessTokenPayload) {
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
    },

    async decisions(user: AccessTokenPayload, query: { from?: string; to?: string; limit?: number } = {}): Promise<ChecklistDecision[]> {
        const orgWide = isAdminOrPc(user.role)
        if (!orgWide && (!isHod(user) || !user.departmentId)) return []

        const limit = Math.min(DECISIONS_MAX, Math.max(1, Math.trunc(query.limit ?? DECISIONS_MAX) || DECISIONS_MAX))
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
        const dayStart = (v: string) => Date.parse(`${v}T00:00:00.000Z`) - offsetMs
        const fromMs = query.from ? (isDay(query.from) ? dayStart(query.from) : Date.parse(query.from)) : dayStart(orgLocalDate(Date.now()))
        const toMs = query.to ? (isDay(query.to) ? dayStart(query.to) + 86_400_000 : Date.parse(query.to)) : null
        if (Number.isNaN(fromMs) || (toMs !== null && Number.isNaN(toMs))) throw AppError.badRequest("Use an ISO date or datetime.")

        const conditions = [
            eq(auditLogs.entityType, "ChecklistInstance"),
            inArray(auditLogs.action, [...DECISION_ACTIONS]),
            gte(auditLogs.createdAt, new Date(fromMs)),
            parentNotDeletedExpr,
        ]
        if (toMs !== null) conditions.push(lt(auditLogs.createdAt, new Date(toMs)))
        if (!orgWide) {
            conditions.push(sql`EXISTS (
                SELECT 1 FROM ${checklistInstanceAssignees} a
                JOIN ${users} u ON u.id = a.userId
                WHERE a.instanceId = ${checklistInstances.id} AND u.departmentId = ${user.departmentId!}
            )`)
        }

        const rows = await db.select({
            id: auditLogs.id,
            instanceId: checklistInstances.id,
            title: checklistInstances.title,
            storeName: stores.name,
            action: auditLogs.action,
            at: auditLogs.createdAt,
            actorName: auditLogs.actorName,
            actorFirstName: users.firstName,
            actorLastName: users.lastName,
            after: auditLogs.after,
        })
            .from(auditLogs)
            .innerJoin(checklistInstances, eq(checklistInstances.id, auditLogs.entityId))
            .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
            .leftJoin(users, eq(users.id, auditLogs.actorId))
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit)

        return rows.map((r) => {
            let after: unknown = r.after
            if (typeof after === "string") {
                try { after = JSON.parse(after) } catch { after = null }
            }
            const a = (after && typeof after === "object" ? after : {}) as { note?: unknown; verificationNote?: unknown; sentBackItemIds?: unknown }
            const rawNote = r.action === "SEND_BACK" ? a.note : r.action === "SUBMIT" ? null : a.verificationNote
            const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : null
            return {
                id: r.id,
                instanceId: r.instanceId,
                title: r.title,
                storeName: r.storeName ?? null,
                action: r.action as ChecklistDecision["action"],
                at: r.at.toISOString(),
                actorName: r.actorName ?? (r.actorFirstName ? `${r.actorFirstName}${r.actorLastName ? ` ${r.actorLastName}` : ""}` : "Unknown"),
                note,
                itemCount: r.action === "SEND_BACK" && Array.isArray(a.sentBackItemIds) ? a.sentBackItemIds.length : null,
            }
        })
    },

    async complianceReport(scope: ChecklistReportScope | null, query: ChecklistReportQuery) {
        return checklistReportService.complianceReport(scope, query)
    },

}
