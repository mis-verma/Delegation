import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, tickets, checklistInstances, checklistInstanceAssignees } from "../../db/schema/index.js"
import { NOT_DELETED as TASK_NOT_DELETED } from "../tasks/taskAccess.js"
import { NOT_DELETED as TICKET_NOT_DELETED } from "../tickets/ticketShared.js"
import { parentNotDeletedExpr } from "../checklistInstances/checklistInstanceShared.js"
import { utcSql } from "../checklistInstances/checklistReportRange.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

export const LATE_AFTER_MS = 24 * 3_600_000

export type MyApprovalCounts = { waiting: number; delayed: number; fresh: number; approvedToday: number }
export type MyApprovals = { tickets: MyApprovalCounts; delegations: MyApprovalCounts; checklists: MyApprovalCounts }

export const emptyCounts = (): MyApprovalCounts => ({ waiting: 0, delayed: 0, fresh: 0, approvedToday: 0 })

export const toCounts = (row: { waiting?: unknown; delayed?: unknown; approvedToday?: unknown } | undefined): MyApprovalCounts => {
    const waiting = Number(row?.waiting ?? 0)
    const delayed = Math.min(Number(row?.delayed ?? 0), waiting)
    return { waiting, delayed, fresh: waiting - delayed, approvedToday: Number(row?.approvedToday ?? 0) }
}

export const myApprovals = async (user: AccessTokenPayload, now: Date = new Date()): Promise<MyApprovals> => {
    const lateBefore = utcSql(new Date(now.getTime() - LATE_AFTER_MS))
    const dayStart = utcSql(orgDayStartUtc(now))

    const [ticketRow] = await db.select({
        waiting: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.status} = 'PENDING_APPROVAL' THEN 1 ELSE 0 END), 0)`,
        delayed: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.status} = 'PENDING_APPROVAL' AND COALESCE(${tickets.submittedAt}, ${tickets.updatedAt}) < ${lateBefore} THEN 1 ELSE 0 END), 0)`,
        approvedToday: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.status} = 'CLOSED' AND ${tickets.verifiedAt} >= ${dayStart} THEN 1 ELSE 0 END), 0)`,
    }).from(tickets).where(and(TICKET_NOT_DELETED, eq(tickets.assigneeId, user.sub)))

    const mineTask = sql`(${tasks.assigneeId} = ${user.sub} OR EXISTS (SELECT 1 FROM ${taskAdditionalAssignees} ta WHERE ta.taskId = ${tasks.id} AND ta.userId = ${user.sub}))`
    const [taskRow] = await db.select({
        waiting: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'pending_approval' THEN 1 ELSE 0 END), 0)`,
        delayed: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'pending_approval' AND COALESCE(${tasks.submittedAt}, ${tasks.updatedAt}) < ${lateBefore} THEN 1 ELSE 0 END), 0)`,
        approvedToday: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'done' AND ${tasks.verifiedAt} >= ${dayStart} THEN 1 ELSE 0 END), 0)`,
    }).from(tasks).where(and(TASK_NOT_DELETED, eq(tasks.category, "delegation"), isNull(tasks.parentTaskId), mineTask))

    const mineRun = sql`EXISTS (SELECT 1 FROM ${checklistInstanceAssignees} a WHERE a.instanceId = ${checklistInstances.id} AND a.userId = ${user.sub})`
    const [runRow] = await db.select({
        waiting: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstances.verificationStatus} = 'PENDING_APPROVAL' THEN 1 ELSE 0 END), 0)`,
        delayed: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstances.verificationStatus} = 'PENDING_APPROVAL' AND ${checklistInstances.updatedAt} < ${lateBefore} THEN 1 ELSE 0 END), 0)`,
        approvedToday: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstances.verificationStatus} = 'APPROVED' AND ${checklistInstances.verifiedAt} >= ${dayStart} THEN 1 ELSE 0 END), 0)`,
    }).from(checklistInstances).where(and(parentNotDeletedExpr, mineRun))

    return { tickets: toCounts(ticketRow), delegations: toCounts(taskRow), checklists: toCounts(runRow) }
}
