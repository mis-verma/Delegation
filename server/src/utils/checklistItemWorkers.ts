import { and, eq, isNull } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklists, taskAdditionalAssignees, taskChecklists, tasks, tickets } from "../db/schema/index.js"
import { AppError } from "./AppError.js"
import type { AccessTokenPayload } from "../middleware/auth/auth.js"
import { isAdminOrPc } from "./roles.js"

export const assertCanWorkChecklistItem = async (
    user: AccessTokenPayload,
    item: { assigneeId: string | null },
    workerIds: () => Promise<string[]>,
    message: string,
) => {
    if (isAdminOrPc(user.role)) return
    if (item.assigneeId) {
        if (item.assigneeId === user.sub) return
        throw AppError.forbidden(message)
    }
    if ((await workerIds()).includes(user.sub)) return
    throw AppError.forbidden(message)
}

type TaskState = { status: string; declinedAt: Date | null; awaitingHeadApproval: boolean }

export const assertTaskStateAllowsChecklistWork = (task: TaskState, user: AccessTokenPayload, options: { managing?: boolean } = {}) => {
    if (user.role === "ADMIN") return
    if (task.declinedAt) throw AppError.forbidden("This delegation was declined, so its checklist can't be changed.")
    if (task.awaitingHeadApproval && !options.managing) throw AppError.forbidden("The department head has to approve this delegation before its checklist can be worked on.")
    if (task.status === "done" || task.status === "pending_approval") {
        throw AppError.forbidden("This delegation is closed or waiting for review, so its checklist can't be changed.")
    }
}

export const assertChecklistOpenForWork = async (user: AccessTokenPayload, taskChecklistId: string | null) => {
    if (!taskChecklistId || user.role === "ADMIN") return
    const [row] = await db.select({ status: tasks.status, declinedAt: tasks.declinedAt, awaitingHeadApproval: tasks.awaitingHeadApproval, deletedAt: tasks.deletedAt })
        .from(taskChecklists)
        .innerJoin(tasks, eq(tasks.id, taskChecklists.taskId))
        .where(eq(taskChecklists.id, taskChecklistId))
        .limit(1)
    if (!row || row.deletedAt) throw AppError.notFound("Delegation not found")
    assertTaskStateAllowsChecklistWork(row, user)
}

export const taskChecklistWorkerIds = async (taskChecklistId: string): Promise<string[]> => {
    const [row] = await db.select({ taskId: tasks.id, assigneeId: tasks.assigneeId })
        .from(taskChecklists)
        .innerJoin(tasks, eq(tasks.id, taskChecklists.taskId))
        .where(and(eq(taskChecklists.id, taskChecklistId), isNull(tasks.deletedAt)))
        .limit(1)
    if (!row) return []
    const additional = await db.select({ userId: taskAdditionalAssignees.userId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.taskId, row.taskId))
    return [row.assigneeId, ...additional.map((a) => a.userId)].filter((id): id is string => !!id)
}

export const assertTicketChecklistOpen = async (user: AccessTokenPayload, checklistId: string | null) => {
    if (!checklistId || user.role === "ADMIN") return
    const [row] = await db.select({ status: tickets.status, deletedAt: tickets.deletedAt })
        .from(checklists)
        .innerJoin(tickets, eq(tickets.id, checklists.ticketId))
        .where(eq(checklists.id, checklistId))
        .limit(1)
    if (!row || row.deletedAt) throw AppError.notFound("Ticket not found")
    if (row.status === "CLOSED") throw AppError.forbidden("This ticket is closed, so its checklist can't be changed.")
}

export const ticketChecklistWorkerIds =async (checklistId: string): Promise<string[]> => {
    const [row] = await db.select({ assigneeId: tickets.assigneeId })
        .from(checklists)
        .innerJoin(tickets, eq(tickets.id, checklists.ticketId))
        .where(eq(checklists.id, checklistId))
        .limit(1)
    return row?.assigneeId ? [row.assigneeId] : []
}
