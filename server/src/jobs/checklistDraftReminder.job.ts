// Hourly sweep that finds ChecklistInstance rows someone started (completed at least one item)
// and then stopped for a while, still with time left before the deadline, and haven't been
// nudged yet — sends one "finish this" reminder per instance, then stamps `draftReminderSentAt`
// so it's never repeated. Deliberately narrower than checklistOverdueNotifier.job.ts: this only
// ever looks at instances that are NOT yet overdue (once the deadline passes, that job takes
// over) and that have real progress on them (an untouched instance isn't a "forgotten draft," it
// just hasn't been started — nothing to remind anyone to finish).
import { scheduleJob } from '../utils/jobTracker.js';
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklistDefinitions, checklistInstances, checklistInstanceAssignees, checklistInstanceItems, checklistInstanceReviewers } from "../db/schema/index.js"
import { notificationService } from "../modules/notifications/notification.service.js"
import { env } from "../config/env.js"

const REMINDER_BATCH_SIZE = 500;

// Same deadline rule as checklistOverdueNotifier.job.ts — re-expressed here rather than shared,
// see that file's comment for why. Keep both in sync if the deadline rule ever changes.
const deadlineExpr = sql`CASE
    WHEN ${checklistInstances.cutoffTime} IS NULL THEN ${checklistInstances.periodEnd}
    WHEN ${checklistInstances.opensTime} IS NOT NULL AND ${checklistInstances.cutoffTime} < ${checklistInstances.opensTime}
        THEN TIMESTAMP(DATE_ADD(DATE(${checklistInstances.periodStart}), INTERVAL 1 DAY), CONCAT(${checklistInstances.cutoffTime}, ':00'))
    ELSE TIMESTAMP(DATE(${checklistInstances.periodStart}), CONCAT(${checklistInstances.cutoffTime}, ':00'))
END`

const notifyDraftInstances = async () => {
    if (env.CHECKLIST_DRAFT_REMINDER_HOURS <= 0) return

    // Aggregated per instance: how many items are done vs total, and when the first one was
    // completed — "started, stalled, and not finished" only shows up once you group the items,
    // unlike the overdue sweep's plain EXISTS conditions.
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
            sql`${deadlineExpr} > NOW()`,
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

    // Each instance isolated in its own try/catch — same reasoning as the overdue sweep: one bad
    // row must not stop the rest of this tick's batch from being reminded.
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

// A checklist where every question is done but nobody pressed Submit: after an hour, one nudge.
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
            // Recent runs only: an old finished-but-unsent run is not worth a late nudge.
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

// Approval chase. A run that has sat in PENDING_APPROVAL for 24h gets ONE reminder to its reviewers
// (or, when none were named, the department head(s) and store PCs); after 48h ONE escalation to every
// Admin/PC. approvalReminderSentAt / approvalEscalatedAt make each a one-shot, and both are cleared
// when the run leaves PENDING_APPROVAL (checklistInstance.service.ts), so a resubmission can be
// chased again. "Waiting since" is updatedAt: it is only written when the run enters or leaves
// PENDING_APPROVAL (same assumption pendingApprovalPreview makes).
const APPROVAL_REMINDER_HOURS = 24
const APPROVAL_ESCALATION_HOURS = 48
const HOUR_MS = 3_600_000

// A checklist whose template was soft-deleted has nothing left to approve it into.
const parentNotDeleted = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

export type StaleApproval = { id: string; title: string; storeId: string; waitingSince: Date }

// Runs due a reminder and runs due an escalation right now, oldest first, each set bounded.
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

        // One instance failing must not stop the rest; it is stamped only after its notify went through.
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

// Hourly at :45 (the other checklist sweeps sit at :00, :15 and :30). Returns the promise so a
// failure reaches the System Health heartbeat.
export const startChecklistApprovalReminder = () => {
    notifyStaleApprovals().catch((err) => console.error("Initial checklist approval reminder sweep failed:", err))
    scheduleJob("checklist-approval-reminder", "45 * * * *", 60, () => notifyStaleApprovals())
}

// Runs once immediately (so a server restart doesn't wait up to an hour to catch up), then hourly
// at :30 — offset from the instance generator's (:00) and overdue notifier's (:15) own sweeps so
// none of the three tick at the same moment for no reason.
const sweep = async () => {
    await notifyDraftInstances()
    await notifyUnsubmittedInstances()
}

// The scheduled run returns the promise so a failure reaches the System Health heartbeat instead of
// being swallowed here.
export const startChecklistDraftReminder = () => {
    sweep().catch((err) => console.error("Initial checklist draft reminder sweep failed:", err))
    scheduleJob("checklist-draft-reminder", "30 * * * *", 60, sweep)
}
