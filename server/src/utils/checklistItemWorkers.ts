import { and, eq, isNull } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklists, taskAdditionalAssignees, taskChecklists, tasks, tickets } from "../db/schema/index.js"
import { AppError } from "./AppError.js"
import type { AccessTokenPayload } from "../middleware/auth/auth.js"

export const assertCanWorkChecklistItem = async (
    user: AccessTokenPayload,
    item: { assigneeId: string | null },
    workerIds: () => Promise<string[]>,
    message: string,
) => {
    if (user.role === "ADMIN" || user.role === "PC") return
    if (item.assigneeId) {
        if (item.assigneeId === user.sub) return
        throw AppError.forbidden(message)
    }
    if ((await workerIds()).includes(user.sub)) return
    throw AppError.forbidden(message)
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

export const ticketChecklistWorkerIds = async (checklistId: string): Promise<string[]> => {
    const [row] = await db.select({ assigneeId: tickets.assigneeId })
        .from(checklists)
        .innerJoin(tickets, eq(tickets.id, checklists.ticketId))
        .where(eq(checklists.id, checklistId))
        .limit(1)
    return row?.assigneeId ? [row.assigneeId] : []
}
