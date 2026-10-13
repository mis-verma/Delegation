// Hourly sweep that finds ChecklistInstance rows which just crossed their deadline still
// incomplete and haven't been flagged yet, notifies their assignees + the store's PCs (escalation),
// then stamps `overdueNotifiedAt` so the same instance is never re-notified on a later tick.
import { scheduleJob } from '../utils/jobTracker.js';
import { and, inArray, isNull, sql } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklistInstances, checklistInstanceAssignees, checklistInstanceItems } from "../db/schema/index.js"
import { notificationService } from "../modules/notifications/notification.service.js"
import { settingsService } from "../modules/settings/settings.service.js"
import { deadlineExpr, localNowExpr, parentNotDeletedExpr } from "../modules/checklistInstances/checklistInstance.service.js"
import { missedInstanceIds } from "../modules/checklistInstances/checklistMissedRun.js"

// Same rationale as GENERATOR_BATCH_SIZE in checklistInstanceGenerator.job.ts — keeps every
// unattended sweep job bounded, even though in practice far fewer than this go overdue per hour.
const NOTIFIER_BATCH_SIZE = 500;

// The deadline, the org-local "now" and the deleted-checklist rule come from the same expressions the rest
// of the module uses, so this job cannot drift from what the pages show: a 09:00 cutoff is overdue at 09:00
// org time (not 14:30). A run ends at its deadline (checklistMissedRun.ts), so this fires once, as it
// closes: its people are NOT told to fill it in (they no longer can), only the store's PCs hear it was missed.
const isOverdueAndIncomplete = sql`(
    NOT EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id})
    OR EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 0)
) AND ${deadlineExpr} <= ${localNowExpr}
  AND ${parentNotDeletedExpr}
  AND ${checklistInstances.periodStart} >= DATE_SUB(DATE(${localNowExpr}), INTERVAL 3 DAY)`

const notifyOverdueInstances = async () => {
    if (!settingsService.getCached().notifyChecklistOverdueReminders) return

    const rows = await db.select({
        id: checklistInstances.id,
        title: checklistInstances.title,
        storeId: checklistInstances.storeId,
    })
        .from(checklistInstances)
        .where(and(isOverdueAndIncomplete, isNull(checklistInstances.overdueNotifiedAt)))
        .limit(NOTIFIER_BATCH_SIZE)

    if (rows.length === NOTIFIER_BATCH_SIZE) {
        console.warn(`Checklist overdue notifier: hit the ${NOTIFIER_BATCH_SIZE}-instance batch cap — remaining instances will be picked up on the next sweep.`)
    }
    if (!rows.length) return

    const instanceIds = rows.map((r) => r.id)
    const closedIds = await missedInstanceIds(instanceIds)
    const assigneeLinks = await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, instanceIds))
    const assigneeIdsByInstance = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        assigneeIdsByInstance.set(link.instanceId, list)
    }

    // Each instance isolated in its own try/catch — one bad row (a notification failure, a
    // transient DB blip) must not stop the rest of this tick's batch from being notified.
    const notifiedIds: string[] = []
    for (const row of rows) {
        try {
            await notificationService.notifyChecklistOverdue({
                _id: row.id,
                title: row.title,
                storeId: row.storeId,
                assigneeIds: assigneeIdsByInstance.get(row.id) ?? [],
                closed: closedIds.has(row.id),
            })
            notifiedIds.push(row.id)
        } catch (err) {
            console.error(`Checklist overdue notification failed for instance ${row.id}:`, err)
        }
    }

    if (notifiedIds.length) {
        await db.update(checklistInstances)
            .set({ overdueNotifiedAt: new Date(), updatedAt: new Date() })
            .where(inArray(checklistInstances.id, notifiedIds))
    }
}

// Runs once immediately (so a server restart doesn't wait up to an hour to catch up), then hourly
// at :15 — offset from the instance generator's own :00 sweep so the two don't tick at the exact
// same moment for no reason.
export const startChecklistOverdueNotifier = () => {
    notifyOverdueInstances().catch((err) => console.error("Initial checklist overdue notification sweep failed:", err))
    scheduleJob("checklist-overdue-notifier", "15 * * * *", 60, () => {
        notifyOverdueInstances().catch((err) => console.error("Checklist overdue notification sweep failed:", err))
    })
}
