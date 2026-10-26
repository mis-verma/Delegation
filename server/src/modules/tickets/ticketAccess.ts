import { db } from "../../config/db.js"
import {
  tickets,
  ticketReviewers,

} from "../../db/schema/index.js"
import { eq, and, or, inArray, isNotNull } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { canApproveAtStage, type ApprovalStage } from "./ticketApproval.js"
import { isAdminOrPc, isOwnScopeRole } from "../../utils/roles.js"
import { type TicketRow } from "./ticketShared.js"
import { reviewerTicketIds } from "./ticketRelations.js"

export const visibilityFilter = async (user: AccessTokenPayload) => {
  if (isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER") return undefined

  let base: ReturnType<typeof or>

  if (user.role === "MANAGER") {
    const or_conditions = [eq(tickets.userId, user.sub)]
    if (user.departmentId) or_conditions.push(eq(tickets.departmentId, user.departmentId))
    if (user.storeId) or_conditions.push(eq(tickets.storeId, user.storeId))
    base = or(...or_conditions)
  } else if (user.role === "SENIOR") {
    const seniorConditions = [user.storeId ? eq(tickets.storeId, user.storeId) : eq(tickets.userId, user.sub)]
    if (user.departmentId) {
      seniorConditions.push(and(
        eq(tickets.departmentId, user.departmentId),
        or(eq(tickets.awaitingHeadApproval, true), isNotNull(tickets.declinedAt)),
      )!)
    }
    base = or(...seniorConditions)
  } else if (isOwnScopeRole(user.role)) {
    base = or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))!
  } else {
    base = eq(tickets.userId, user.sub)
  }

  const reviewedIds = await reviewerTicketIds(user.sub)
  return reviewedIds.length ? or(base!, inArray(tickets.id, reviewedIds)) : base
}

export const assertCanVerify = async (
  ticket: { id: string; departmentId: string | null; assigneeId: string | null; userId: string; approvalStage: ApprovalStage | null },
  user: AccessTokenPayload,
) => {
  if (user.role !== "ADMIN" && ticket.assigneeId === user.sub) {
    throw AppError.forbidden("You can't approve a ticket assigned to you. Someone else has to review it.")
  }
  const stage: ApprovalStage = "PC"
  const [reviewer] = await db.select({ id: ticketReviewers.id })
    .from(ticketReviewers)
    .where(and(eq(ticketReviewers.ticketId, ticket.id), eq(ticketReviewers.userId, user.sub)))
    .limit(1)
  if (canApproveAtStage(stage, ticket, user, !!reviewer)) return
  throw AppError.forbidden("Only PC or an admin can approve this ticket.")
}

export const isSameDeptOrStore = (user: AccessTokenPayload, ticket: Pick<TicketRow, "departmentId" | "storeId">) => {
  const sameDept = Boolean(user.departmentId) && ticket.departmentId === user.departmentId
  const sameStore = Boolean(user.storeId) && ticket.storeId === user.storeId
  return sameDept || sameStore
}

export const assertCanMutate = (user: AccessTokenPayload, ticket: Pick<TicketRow, "userId" | "assigneeId" | "departmentId" | "storeId">) => {
  if (isAdminOrPc(user.role)) return
  if (isOwnScopeRole(user.role)) {
    const ownTicket = ticket.assigneeId === user.sub || ticket.userId === user.sub
    if (ownTicket) return
    throw AppError.forbidden("Not your ticket")
  }

  if (user.role === "MANAGER") {
    if (isSameDeptOrStore(user, ticket)) return
    throw AppError.forbidden("Outside your department/store")
  }

  if (user.role === "SENIOR") {
    if (user.storeId && ticket.storeId === user.storeId) return
    throw AppError.forbidden("Outside your store")
  }

  throw AppError.forbidden()
};

export const isVerifierRole = (user: AccessTokenPayload) => isAdminOrPc(user.role)

export const assertCanSetReviewers = (reviewerIds: string[] | undefined, user: AccessTokenPayload) => {
  if (reviewerIds !== undefined && !isVerifierRole(user)) {
    throw AppError.forbidden("Only an admin or PC can choose who reviews a ticket.")
  }
}
