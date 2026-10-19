import { scheduleJob } from '../utils/jobTracker.js';
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklistDefinitions, checklistInstances, checklistInstanceAssignees, checklistInstanceItems, checklistInstanceReviewers } from "../db/schema/index.js"
import { notificationService } from "../modules/notifications/notification.service.js"
import { env } from "../config/env.js"
import { deadlineExpr, localNowExpr, parentNotDeletedExpr } from "../modules/checklistInstances/checklistInstance.service.js"
import { missedFromPastDayExpr } from "../modules/checklistInstances/checklistMissedRun.js"

const REMINDER_BATCH_SIZE = 500;

const notifyDraftInstances = async () => {
    if (env.CHECKLIST_DRAFT_REMINDER_HOURS <= 0) return

    const rows = await db.select({
        id: checklistInstances.id,
        title: checklistInstances.title,
        storeId: checklistInstances.storeId,
        doneCount: sql<number>`SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END)`,
        totalCount: sql<number>`COUNT(*)`,
        firstCompletedAt: sql<Date | null>`MIN(CASE WHEN ${checklistInstanceItems.isDone} THEN ${checklistInstanceItems.completedAt} END)`,
    })
        .from(checklistInstances)
        .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(and(
            isNull(checklistInstances.draftReminderSentAt),
            sql`${deadlineExpr} > ${localNowExpr}`,
            sql`NOT ${missedFromPastDayExpr}`,
            parentNotDeletedExpr,
        ))
        .groupBy(checklistInstances.id, checklistInstances.title, checklistInstances.storeId)
        .having(sql`SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END) > 0
            AND SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END) < COUNT(*)
            AND MIN(CASE WHEN ${checklistInstanceItems.isDone} THEN ${checklistInstanceItems.completedAt} END)
                <= DATE_SUB(NOW(), INTERVAL ${env.CHECKLIST_DRAFT_REMINDER_HOURS} HOUR)`)
        .limit(REMINDER_BATCH_SIZE)

    if (rows.length === REMINDER_BATCH_SIZE) {
        console.warn(`Checklist draft reminder: hit the ${REMINDER_BATCH_SIZE}-instance batch cap — remaining instances will be picked up on the next sweep.`)
    }
    if (!rows.length) return

    const instanceIds = rows.map((r) => r.id)
    const assigneeLinks = await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, instanceIds))
    const assigneeIdsByInstance = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        assigneeIdsByInstance.set(link.instanceId, list)
    }

    const notifiedIds: string[] = []
    for (const row of rows) {
        try {
            await notificationService.notifyChecklistDraftReminder({
                _id: row.id,
                title: row.title,
                storeId: row.storeId,
                assigneeIds: assigneeIdsByInstance.get(row.id) ?? [],
                remaining: Number(row.totalCount) - Number(row.doneCount),
            })
            notifiedIds.push(row.id)
        } catch (err) {
            console.error(`Checklist draft reminder failed for instance ${row.id}:`, err)
        }
    }

    if (notifiedIds.length) {
        await db.update(checklistInstances)
            .set({ draftReminderSentAt: new Date(), updatedAt: new Date() })
            .where(inArray(checklistInstances.id, notifiedIds))
    }
}

const notifyUnsubmittedInstances = async () => {
    if (env.CHECKLIST_DRAFT_REMINDER_HOURS <= 0) return

    const rows = await db.select({
        id: checklistInstances.id,
        title: checklistInstances.title,
        storeId: checklistInstances.storeId,
    })
        .from(checklistInstances)
        .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(and(
            isNull(checklistInstances.submitReminderSentAt),
            sql`${checklistInstances.periodEnd} >= DATE_SUB(NOW(), INTERVAL 3 DAY)`,
            inArray(checklistInstances.verificationStatus, ["NOT_SUBMITTED", "REJECTED"]),
        ))
        .groupBy(checklistInstances.id, checklistInstances.title, checklistInstances.storeId)
        .having(sql`COUNT(*) > 0
            AND SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END) = COUNT(*)
            AND MAX(${checklistInstanceItems.completedAt}) <= DATE_SUB(NOW(), INTERVAL 1 HOUR)`)
        .limit(REMINDER_BATCH_SIZE)
    if (!rows.length) return

    const assigneeLinks = await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, rows.map((r) => r.id)))
    const assigneeIdsByInstance = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        assigneeIdsByInstance.set(link.instanceId, list)
    }

    const notifiedIds: string[] = []
    for (const row of rows) {
        try {
            await notificationService.notifyChecklistSubmitReminder({ _id: row.id, title: row.title, storeId: row.storeId, assigneeIds: assigneeIdsByInstance.get(row.id) ?? [] })
            notifiedIds.push(row.id)
        } catch (err) {
            console.error(`Checklist submit reminder failed for instance ${row.id}:`, err)
        }
    }
    if (notifiedIds.length) {
        await db.update(checklistInstances).set({ submitReminderSentAt: new Date() }).where(inArray(checklistInstances.id, notifiedIds))
    }
}

const APPROVAL_REMINDER_HOURS = 24
const APPROVAL_ESCALATION_HOURS = 48
const HOUR_MS = 3_600_000

const parentNotDeleted = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

export type StaleApproval = { id: string; title: string; storeId: string; waitingSince: Date }

export const findStaleApprovals = async (now: Date = new Date()): Promise<{ reminders: StaleApproval[]; escalations: StaleApproval[] }> => {
    const columns = { id: checklistInstances.id, title: checklistInstances.title, storeId: checklistInstances.storeId, waitingSince: checklistInstances.updatedAt }
    const select = (hours: number, stamp: typeof checklistInstances.approvalReminderSentAt | typeof checklistInstances.approvalEscalatedAt) =>
        db.select(columns).from(checklistInstances)
            .where(and(
                eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"),
                isNull(stamp),
                lte(checklistInstances.updatedAt, new Date(now.getTime() - hours * HOUR_MS)),
                parentNotDeleted,
            ))
            .orderBy(asc(checklistInstances.updatedAt))
            .limit(REMINDER_BATCH_SIZE)
    const [reminders, escalations] = await Promise.all([
        select(APPROVAL_REMINDER_HOURS, checklistInstances.approvalReminderSentAt),
        select(APPROVAL_ESCALATION_HOURS, checklistInstances.approvalEscalatedAt),
    ])
    if (reminders.length === REMINDER_BATCH_SIZE || escalations.length === REMINDER_BATCH_SIZE) {
        console.warn(`Checklist approval reminder: hit the ${REMINDER_BATCH_SIZE}-instance batch cap — the rest will be picked up on the next sweep.`)
    }
    return { reminders, escalations }
}

const groupUserIds = <T extends { instanceId: string; userId: string }>(links: T[]) => {
    const map = new Map<string, string[]>()
    for (const link of links) map.set(link.instanceId, [...(map.get(link.instanceId) ?? []), link.userId])
    return map
}

export const notifyStaleApprovals = async (now: Date = new Date()) => {
    const { reminders, escalations } = await findStaleApprovals(now)
    if (!reminders.length && !escalations.length) return

    const hoursWaiting = (row: StaleApproval) => (now.getTime() - row.waitingSince.getTime()) / HOUR_MS

    if (reminders.length) {
        const ids = reminders.map((r) => r.id)
        const [reviewerLinks, assigneeLinks] = await Promise.all([
            db.select({ instanceId: checklistInstanceReviewers.instanceId, userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(inArray(checklistInstanceReviewers.instanceId, ids)),
            db.select({ instanceId: checklistInstanceAssignees.instanceId, userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, ids)),
        ])
        const reviewersBy = groupUserIds(reviewerLinks)
        const assigneesBy = groupUserIds(assigneeLinks)

        const notifiedIds: string[] = []
        for (const row of reminders) {
            try {
                await notificationService.notifyChecklistApprovalReminder({
                    _id: row.id, title: row.title, storeId: row.storeId,
                    reviewerIds: reviewersBy.get(row.id) ?? [], assigneeIds: assigneesBy.get(row.id) ?? [],
                    hoursWaiting: hoursWaiting(row),
                })
                notifiedIds.push(row.id)
            } catch (err) {
                console.error(`Checklist approval reminder failed for instance ${row.id}:`, err)
            }
        }
        if (notifiedIds.length) {
            await db.update(checklistInstances).set({ approvalReminderSentAt: now })
                .where(and(inArray(checklistInstances.id, notifiedIds), eq(checklistInstances.verificationStatus, "PENDING_APPROVAL")))
        }
    }

    if (escalations.length) {
        const notifiedIds: string[] = []
        for (const row of escalations) {
            try {
                await notificationService.notifyChecklistApprovalEscalation({ _id: row.id, title: row.title, storeId: row.storeId, hoursWaiting: hoursWaiting(row) })
                notifiedIds.push(row.id)
            } catch (err) {
                console.error(`Checklist approval escalation failed for instance ${row.id}:`, err)
            }
        }
        if (notifiedIds.length) {
            await db.update(checklistInstances).set({ approvalEscalatedAt: now })
                .where(and(inArray(checklistInstances.id, notifiedIds), eq(checklistInstances.verificationStatus, "PENDING_APPROVAL")))
        }
    }
}

export const startChecklistApprovalReminder = () => {
    notifyStaleApprovals().catch((err) => console.error("Initial checklist approval reminder sweep failed:", err))
    scheduleJob("checklist-approval-reminder", "45 * * * *", 60, () => notifyStaleApprovals())
}

const sweep = async () => {
    await notifyDraftInstances()
    await notifyUnsubmittedInstances()
}

export const startChecklistDraftReminder = () => {
    sweep().catch((err) => console.error("Initial checklist draft reminder sweep failed:", err))
    scheduleJob("checklist-draft-reminder", "30 * * * *", 60, sweep)
}
