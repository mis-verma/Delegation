import { and, eq, inArray, notInArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/index.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { AppError } from "../../utils/AppError.js"

export type ApprovalStage = "HOD" | "PC"

type Actor = { sub: string; role: string; departmentId?: string | null }

type StageTicket = {
  departmentId: string | null
  assigneeId: string | null
  userId: string
}

export const isDepartmentHead = (user: Actor, ticket: Pick<StageTicket, "departmentId">): boolean =>
  isDepartmentHeadRole(user.role) && !!user.departmentId && ticket.departmentId === user.departmentId

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

export const resolveGateDepartment = async (
  departmentId: string | null,
  assigneeId: string | null,
  actor: Actor,
): Promise<string | null> => {
  if (!assigneeId) return departmentId
  const [person] = await db.select({ departmentId: users.departmentId }).from(users).where(eq(users.id, assigneeId)).limit(1)
  const personDepartmentId = person?.departmentId ?? null
  if (!departmentId) return personDepartmentId
  if (personDepartmentId && personDepartmentId !== departmentId && !isAdminOrPc(actor.role)) {
    throw AppError.badRequest("That person is not in the selected department. Pick the department they belong to so its head can approve.")
  }
  return departmentId
}

export const assignmentNeedsHeadApproval = async (ticket: Pick<StageTicket, "departmentId">, actor: Actor): Promise<boolean> => {
  if (!ticket.departmentId) return false
  if (isAdminOrPc(actor.role)) return false
  if (isDepartmentHead(actor, ticket)) return false
  const heads = await activeDepartmentHeadIds(ticket.departmentId, [actor.sub])
  return heads.length > 0
}

export const canApproveAssignment = (ticket: Pick<StageTicket, "departmentId">, user: Actor): boolean => {
  if (isAdminOrPc(user.role)) return true
  return isDepartmentHead(user, ticket)
}
