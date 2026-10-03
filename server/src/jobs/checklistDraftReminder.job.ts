// Hourly sweep that finds ChecklistInstance rows someone started (completed at least one item)
// and then stopped for a while, still with time left before the deadline, and haven't been
// nudged yet — sends one "finish this" reminder per instance, then stamps `draftReminderSentAt`
// so it's never repeated. Deliberately narrower than checklistOverdueNotifier.job.ts: this only
// ever looks at instances that are NOT yet overdue (once the deadline passes, that job takes
// over) and that have real progress on them (an untouched instance isn't a "forgotten draft," it
// just hasn't been started — nothing to remind anyone to finish).
import { scheduleJob } from '../utils/jobTracker.js';
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklistInstances, checklistInstanceAssignees, checklistInstanceItems } from "../db/schema/index.js"
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

// Runs once immediately (so a server restart doesn't wait up to an hour to catch up), then hourly
// at :30 — offset from the instance generator's (:00) and overdue notifier's (:15) own sweeps so
// none of the three tick at the same moment for no reason.
export const startChecklistDraftReminder = () => {
    notifyDraftInstances().catch((err) => console.error("Initial checklist draft reminder sweep failed:", err))
    scheduleJob("checklist-draft-reminder", "30 * * * *", 60, () => {
        notifyDraftInstances().catch((err) => console.error("Checklist draft reminder sweep failed:", err))
    })
}
