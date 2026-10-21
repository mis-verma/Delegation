import { and, eq, inArray, notInArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/index.js"

export type ApprovalStage = "HOD" | "PC"

type Actor = { sub: string; role: string; departmentId?: string | null }

type StageTicket = {
  departmentId: string | null
  assigneeId: string | null
  userId: string
}

export const isDepartmentHead = (user: Actor, ticket: Pick<StageTicket, "departmentId">): boolean =>
  (user.role === "MANAGER" || user.role === "SENIOR") && !!user.departmentId && ticket.departmentId === user.departmentId

export const canApproveAtStage = (stage: ApprovalStage, ticket: StageTicket, user: Actor, isNamedReviewer: boolean): boolean => {
  if (user.role === "ADMIN") return true
  if (ticket.assigneeId === user.sub) return false
  if (stage === "HOD") return isDepartmentHead(user, ticket) && ticket.userId !== user.sub
  if (user.role === "PC") return true
  return isNamedReviewer
}

export const activeDepartmentHeadIds = async (departmentId: string | null, excludeIds: (string | null | undefined)[]): Promise<string[]> => {
  if (!departmentId) return []
  const excluded = excludeIds.filter((id): id is string => Boolean(id))
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      inArray(users.role, ["MANAGER", "SENIOR"]),
      eq(users.departmentId, departmentId),
      eq(users.isActive, true),
      excluded.length ? notInArray(users.id, excluded) : undefined,
    ))
  return rows.map((r) => r.id)
}

export const firstApprovalStage = async (ticket: StageTicket): Promise<ApprovalStage> => {
  const heads = await activeDepartmentHeadIds(ticket.departmentId, [ticket.assigneeId, ticket.userId])
  return heads.length > 0 ? "HOD" : "PC"
}

export const assignmentNeedsHeadApproval = async (ticket: Pick<StageTicket, "departmentId" | "assigneeId">, actor: Actor): Promise<boolean> => {
  if (!ticket.assigneeId || !ticket.departmentId) return false
  if (actor.role === "ADMIN" || actor.role === "PC") return false
  if (isDepartmentHead(actor, ticket)) return false
  const heads = await activeDepartmentHeadIds(ticket.departmentId, [ticket.assigneeId, actor.sub])
  return heads.length > 0
}

export const canApproveAssignment = (ticket: Pick<StageTicket, "departmentId" | "assigneeId">, user: Actor): boolean => {
  if (user.role === "ADMIN" || user.role === "PC") return true
  if (ticket.assigneeId === user.sub) return false
  return isDepartmentHead(user, ticket)
}
