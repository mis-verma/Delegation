import { db } from "../../config/db.js"
import { taskDepartmentApprovals, taskAdditionalAssignees } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { and, eq, inArray } from "drizzle-orm"
import { assignmentNeedsHeadApproval } from "../tickets/ticketApproval.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { peopleByIds } from "./taskRelations.js"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Actor = { sub: string; role: string; departmentId?: string | null }

export type ApprovalRow = typeof taskDepartmentApprovals.$inferSelect

export const involvedDepartmentIds = async (
    task: { departmentId: string | null; assigneeId: string | null },
    additionalAssigneeIds: string[],
): Promise<string[]> => {
    const personIds = [...new Set([task.assigneeId, ...additionalAssigneeIds].filter((id): id is string => !!id))]
    const rows = personIds.length
        ? await db.select({ departmentId: users.departmentId }).from(users).where(inArray(users.id, personIds))
        : []
    return [...new Set([task.departmentId, ...rows.map((r) => r.departmentId)].filter((id): id is string => !!id))]
}

export const additionalAssigneeIdsOf = async (taskId: string): Promise<string[]> =>
    (await db.select({ userId: taskAdditionalAssignees.userId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, taskId))).map((r) => r.userId)

export const departmentsNeedingApproval = async (departmentIds: string[], actor: Actor): Promise<string[]> => {
    const checks = await Promise.all(departmentIds.map(async (departmentId) => ({
        departmentId,
        needed: await assignmentNeedsHeadApproval({ departmentId }, actor),
    })))
    return checks.filter((c) => c.needed).map((c) => c.departmentId)
}

export const approvalRowsOf = async (taskId: string): Promise<ApprovalRow[]> =>
    db.select().from(taskDepartmentApprovals).where(eq(taskDepartmentApprovals.taskId, taskId))

export type ApprovalPlan = { deleteIds: string[]; insertDepartmentIds: string[]; pendingDepartmentIds: string[] }

export const planApprovalRows = (
    existing: Pick<ApprovalRow, "id" | "departmentId" | "status">[],
    involved: string[],
    required: string[],
    reset: boolean,
): ApprovalPlan => {
    const involvedSet = new Set(involved)
    const kept = existing.filter((r) => !reset && involvedSet.has(r.departmentId))
    const keptDepartments = new Set(kept.map((r) => r.departmentId))
    const insertDepartmentIds = required.filter((d) => !keptDepartments.has(d))
    const pendingDepartmentIds = [
        ...kept.filter((r) => r.status === "pending").map((r) => r.departmentId),
        ...insertDepartmentIds,
    ]
    return {
        deleteIds: existing.filter((r) => reset || !involvedSet.has(r.departmentId)).map((r) => r.id),
        insertDepartmentIds,
        pendingDepartmentIds,
    }
}

export const applyApprovalPlan = async (tx: Tx, taskId: string, plan: ApprovalPlan) => {
    if (plan.deleteIds.length) await tx.delete(taskDepartmentApprovals).where(inArray(taskDepartmentApprovals.id, plan.deleteIds))
    if (plan.insertDepartmentIds.length) {
        await tx.insert(taskDepartmentApprovals).values(plan.insertDepartmentIds.map((departmentId) => ({ taskId, departmentId })))
    }
}

export const headDepartmentOf = (user: Actor): string | null =>
    isDepartmentHeadRole(user.role) && user.departmentId ? user.departmentId : null

export const pendingDepartmentsFor = (rows: ApprovalRow[]): string[] =>
    rows.filter((r) => r.status === "pending").map((r) => r.departmentId)

export const approvalBlockers = (
    task: { departmentId: string | null },
    rows: ApprovalRow[],
    user: Actor,
): string[] => {
    if (user.role === "ADMIN" || isAdminOrPc(user.role)) return []
    const mine = headDepartmentOf(user)
    const pending = pendingDepartmentsFor(rows)
    if (!pending.length) return !mine || mine !== task.departmentId ? ["*"] : []
    return pending.filter((d) => d !== mine)
}

export const canDecideOnAssignment = (
    task: { departmentId: string | null },
    rows: ApprovalRow[],
    user: Actor,
): boolean => {
    if (isAdminOrPc(user.role)) return true
    const mine = headDepartmentOf(user)
    if (!mine) return false
    if (rows.length === 0) return mine === task.departmentId
    return rows.some((r) => r.departmentId === mine) || mine === task.departmentId
}

export const canApproveNow = (
    task: { departmentId: string | null },
    rows: ApprovalRow[],
    user: Actor,
): boolean => {
    if (isAdminOrPc(user.role)) return true
    const mine = headDepartmentOf(user)
    if (!mine) return false
    if (rows.length === 0) return mine === task.departmentId
    return rows.some((r) => r.status === "pending" && r.departmentId === mine)
}

export const markApproved = async (tx: Tx, taskId: string, user: Actor, onlyDepartmentId: string | null): Promise<number> => {
    const conditions = [eq(taskDepartmentApprovals.taskId, taskId), eq(taskDepartmentApprovals.status, "pending")]
    if (onlyDepartmentId) conditions.push(eq(taskDepartmentApprovals.departmentId, onlyDepartmentId))
    const [result] = await tx.update(taskDepartmentApprovals)
        .set({ status: "approved", decidedBy: user.sub, decidedAt: new Date() })
        .where(and(...conditions))
    return result.affectedRows
}

export const countPending = async (tx: Tx, taskId: string): Promise<number> =>
    (await tx.select({ id: taskDepartmentApprovals.id }).from(taskDepartmentApprovals)
        .where(and(eq(taskDepartmentApprovals.taskId, taskId), eq(taskDepartmentApprovals.status, "pending")))).length

export const approvalsByTask = async (taskIds: string[]) => {
    const byTask = new Map<string, { departmentId: string; status: "pending" | "approved"; decidedAt: Date | null; approver: { id: string; firstName: string; lastName: string | null } | null }[]>()
    if (!taskIds.length) return byTask
    const rows = await db.select().from(taskDepartmentApprovals).where(inArray(taskDepartmentApprovals.taskId, taskIds))
    const people = await peopleByIds([...new Set(rows.map((r) => r.decidedBy).filter((id): id is string => !!id))])
    for (const row of rows) {
        const approver = row.decidedBy ? people.get(row.decidedBy) : undefined
        const list = byTask.get(row.taskId) ?? []
        list.push({
            departmentId: row.departmentId,
            status: row.status,
            decidedAt: row.decidedAt,
            approver: approver ? { id: approver.id, firstName: approver.firstName, lastName: approver.lastName } : null,
        })
        byTask.set(row.taskId, list)
    }
    return byTask
}

export const approvalsOf = async (taskId: string) => (await approvalsByTask([taskId])).get(taskId) ?? []
