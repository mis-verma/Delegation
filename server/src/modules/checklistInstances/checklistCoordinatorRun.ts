import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceAssignees, checklistInstances, users } from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"

export const COORDINATOR_REVIEW_MESSAGE = "A Process Coordinator's checklist is approved by an Admin or their department head, not by another Process Coordinator."

export const coordinatorRunSql = sql`EXISTS (
    SELECT 1 FROM ${checklistInstanceAssignees} ca
    JOIN ${users} cu ON cu.id = ca.userId
    WHERE ca.instanceId = ${checklistInstances.id} AND cu.role = 'PC'
)`

export const coordinatorAssigneeIds = async (userIds: string[]): Promise<Set<string>> => {
    if (!userIds.length) return new Set()
    const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), eq(users.role, "PC")))
    return new Set(rows.map((r) => r.id))
}

export const isCoordinatorRun = async (instanceId: string): Promise<boolean> => {
    const [row] = await db
        .select({ id: checklistInstanceAssignees.userId })
        .from(checklistInstanceAssignees)
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .where(and(eq(checklistInstanceAssignees.instanceId, instanceId), eq(users.role, "PC")))
        .limit(1)
    return !!row
}

export const assertCoordinatorRunReviewer = async (instanceId: string, user: { role: string }) => {
    if (user.role !== "PC") return
    if (await isCoordinatorRun(instanceId)) throw AppError.forbidden(COORDINATOR_REVIEW_MESSAGE)
}

export const coordinatorReviewerIds = async (assigneeIds: string[]): Promise<string[]> => {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)))
    const departmentRows = assigneeIds.length
        ? await db.select({ departmentId: users.departmentId }).from(users).where(inArray(users.id, assigneeIds))
        : []
    const departmentIds = [...new Set(departmentRows.map((r) => r.departmentId).filter((d): d is string => !!d))]
    const heads = departmentIds.length
        ? await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ["MANAGER", "SENIOR"]), inArray(users.departmentId, departmentIds), eq(users.isActive, true)))
        : []
    return [...new Set([...admins.map((a) => a.id), ...heads.map((h) => h.id)])]
}
