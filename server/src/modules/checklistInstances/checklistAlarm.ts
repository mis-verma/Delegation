import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { checklistInstanceAssignees, checklistInstanceItems, checklistInstances, departments, users } from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { formatClock } from "../checklistDefinitions/lateWindow.js"
import { notifyMany } from "../notifications/notificationCore.js"
import { ALARM_TYPE } from "../notifications/urgentEmail.js"
import { deadlineExpr, localNowExpr, parentNotDeletedExpr } from "./checklistInstanceShared.js"
import { runDeadlineMs } from "./checklistRunEnd.js"

export const ALARM_LEAD_MINUTES = 30
export const ALARM_REPEAT_MINUTES = 10
export const SNOOZE_CHOICES = [10, 30] as const
const ALARM_BATCH_SIZE = 500

const openItemsExpr = sql<number>`(SELECT COUNT(*) FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 0)`

const ringingWindow = and(
    eq(departments.alarmReminders, true),
    eq(users.isActive, true),
    inArray(checklistInstances.verificationStatus, ["NOT_SUBMITTED", "REJECTED"]),
    parentNotDeletedExpr,
    sql`${openItemsExpr} > 0`,
    sql`${deadlineExpr} > ${localNowExpr}`,
    sql`${deadlineExpr} <= DATE_ADD(${localNowExpr}, INTERVAL ${ALARM_LEAD_MINUTES} MINUTE)`,
)

const ringingRows = (extra?: ReturnType<typeof and>) =>
    db.select({
        assigneeRowId: checklistInstanceAssignees.id,
        userId: checklistInstanceAssignees.userId,
        snoozedUntil: checklistInstanceAssignees.alarmSnoozedUntil,
        instanceId: checklistInstances.id,
        title: checklistInstances.title,
        periodStart: checklistInstances.periodStart,
        periodEnd: checklistInstances.periodEnd,
        cutoffTime: checklistInstances.cutoffTime,
        opensTime: checklistInstances.opensTime,
        openItems: openItemsExpr,
    })
        .from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .innerJoin(departments, eq(departments.id, users.departmentId))
        .where(extra ? and(ringingWindow, extra) : ringingWindow)

const closesAtLabel = (row: { cutoffTime: string | null }) => (row.cutoffTime ? formatClock(row.cutoffTime) : "the end of the day")

export const ringDueAlarms = async (now = new Date()) => {
    const repeatBefore = new Date(now.getTime() - ALARM_REPEAT_MINUTES * 60_000)
    const due = await ringingRows(and(
        or(isNull(checklistInstanceAssignees.alarmSnoozedUntil), lte(checklistInstanceAssignees.alarmSnoozedUntil, now)),
        or(isNull(checklistInstanceAssignees.alarmRungAt), lte(checklistInstanceAssignees.alarmRungAt, repeatBefore)),
    )).limit(ALARM_BATCH_SIZE)
    if (!due.length) return 0

    const byInstance = new Map<string, typeof due>()
    for (const row of due) byInstance.set(row.instanceId, [...(byInstance.get(row.instanceId) ?? []), row])

    const rungRowIds: string[] = []
    for (const rows of byInstance.values()) {
        const first = rows[0]!
        const minutesLeft = Math.max(1, Math.round((runDeadlineMs(first, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES) - now.getTime()) / 60_000))
        const open = Number(first.openItems)
        try {
            await notifyMany(rows.map((r) => r.userId), {
                type: ALARM_TYPE,
                title: `Due in ${minutesLeft} min: ${first.title}`,
                message: `${open} ${open === 1 ? "question is" : "questions are"} still open. It closes at ${closesAtLabel(first)}. Open it to finish, or snooze for a few minutes.`,
                checklistInstanceId: first.instanceId,
            })
            rungRowIds.push(...rows.map((r) => r.assigneeRowId))
        } catch (err) {
            console.error(`Checklist alarm failed for instance ${first.instanceId}:`, err)
        }
    }

    if (rungRowIds.length) {
        await db.update(checklistInstanceAssignees).set({ alarmRungAt: now, alarmSnoozedUntil: null }).where(inArray(checklistInstanceAssignees.id, rungRowIds))
    }
    return rungRowIds.length
}

export const myRingingAlarms = async (user: AccessTokenPayload) => {
    const rows = await ringingRows(eq(checklistInstanceAssignees.userId, user.sub))
    return rows.map((row) => ({
        instanceId: row.instanceId,
        title: row.title,
        deadlineAt: new Date(runDeadlineMs(row, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)).toISOString(),
        openItems: Number(row.openItems),
        snoozedUntil: row.snoozedUntil && row.snoozedUntil.getTime() > Date.now() ? row.snoozedUntil.toISOString() : null,
    }))
}

export const snoozeAlarm = async (instanceId: string, minutes: (typeof SNOOZE_CHOICES)[number], user: AccessTokenPayload) => {
    const [link] = await db.select({ id: checklistInstanceAssignees.id }).from(checklistInstanceAssignees)
        .where(and(eq(checklistInstanceAssignees.instanceId, instanceId), eq(checklistInstanceAssignees.userId, user.sub)))
        .limit(1)
    if (!link) throw AppError.forbidden("Only the people filling this checklist can snooze its alarm.")
    const snoozedUntil = new Date(Date.now() + minutes * 60_000)
    await db.update(checklistInstanceAssignees).set({ alarmSnoozedUntil: snoozedUntil }).where(eq(checklistInstanceAssignees.id, link.id))
    return { instanceId, snoozedUntil: snoozedUntil.toISOString() }
}
