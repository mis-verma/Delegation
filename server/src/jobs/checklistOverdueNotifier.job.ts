import { scheduleJob } from '../utils/jobTracker.js';
import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklistInstances, checklistInstanceAssignees, checklistInstanceItems } from "../db/schema/index.js"
import { notificationService } from "../modules/notifications/notification.service.js"
import { settingsService } from "../modules/settings/settings.service.js"
import { deadlineExpr, localNowExpr, parentNotDeletedExpr } from "../modules/checklistInstances/checklistInstance.service.js"
import { missedInstanceIds } from "../modules/checklistInstances/checklistMissedRun.js"
import { hasRunClosingPassed } from "../modules/checklistInstances/checklistRunEnd.js"
import { formatClock } from "../modules/checklistDefinitions/lateWindow.js"
import { env } from "../config/env.js"

const NOTIFIER_BATCH_SIZE = 500;

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
        periodStart: checklistInstances.periodStart,
        periodEnd: checklistInstances.periodEnd,
        cutoffTime: checklistInstances.cutoffTime,
        opensTime: checklistInstances.opensTime,
        lateUntilTime: checklistInstances.lateUntilTime,
    })
        .from(checklistInstances)
        .where(and(isOverdueAndIncomplete, isNull(checklistInstances.overdueNotifiedAt)))
        .limit(NOTIFIER_BATCH_SIZE)

    if (rows.length === NOTIFIER_BATCH_SIZE) {
        console.warn(`Checklist overdue notifier: hit the ${NOTIFIER_BATCH_SIZE}-instance batch cap — remaining instances will be picked up on the next sweep.`)
    }
    if (!rows.length) return

    const instanceIds = rows.map((r) => r.id)
    const missedIds = await missedInstanceIds(instanceIds)
    const closingPassed = new Set(
        rows.filter((r) => hasRunClosingPassed(r, Date.now(), env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)).map((r) => r.id),
    )
    const closedIds = new Set([...missedIds].filter((id) => closingPassed.has(id)))
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
            await notificationService.notifyChecklistOverdue({
                _id: row.id,
                title: row.title,
                storeId: row.storeId,
                assigneeIds: assigneeIdsByInstance.get(row.id) ?? [],
                closed: closedIds.has(row.id),
                fillUntil: row.lateUntilTime && !closedIds.has(row.id) ? formatClock(row.lateUntilTime) : undefined,
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

const notifyLateWindowEnded = async () => {
    if (!settingsService.getCached().notifyChecklistOverdueReminders) return

    const candidates = await db.select({
        id: checklistInstances.id,
        title: checklistInstances.title,
        storeId: checklistInstances.storeId,
        periodStart: checklistInstances.periodStart,
        periodEnd: checklistInstances.periodEnd,
        cutoffTime: checklistInstances.cutoffTime,
        opensTime: checklistInstances.opensTime,
        lateUntilTime: checklistInstances.lateUntilTime,
    })
        .from(checklistInstances)
        .where(and(isOverdueAndIncomplete, isNotNull(checklistInstances.lateUntilTime), isNull(checklistInstances.lateEndNotifiedAt)))
        .limit(NOTIFIER_BATCH_SIZE)

    const ended = candidates.filter((r) => hasRunClosingPassed(r, Date.now(), env.CHECKLIST_TIMEZONE_OFFSET_MINUTES))
    const notifiedIds: string[] = []
    for (const row of ended) {
        try {
            await notificationService.notifyChecklistOverdue({ _id: row.id, title: row.title, storeId: row.storeId, assigneeIds: [], closed: true })
            notifiedIds.push(row.id)
        } catch (err) {
            console.error(`Checklist late-window notification failed for instance ${row.id}:`, err)
        }
    }

    if (notifiedIds.length) {
        await db.update(checklistInstances)
            .set({ lateEndNotifiedAt: new Date(), updatedAt: new Date() })
            .where(inArray(checklistInstances.id, notifiedIds))
    }
}

const sweep = async () => {
    await notifyOverdueInstances()
    await notifyLateWindowEnded()
}

export const startChecklistOverdueNotifier = () => {
    sweep().catch((err) => console.error("Initial checklist overdue notification sweep failed:", err))
    scheduleJob("checklist-overdue-notifier", "15 * * * *", 60, () => {
        sweep().catch((err) => console.error("Checklist overdue notification sweep failed:", err))
    })
}
