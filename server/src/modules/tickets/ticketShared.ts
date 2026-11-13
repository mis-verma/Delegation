import { db } from "../../config/db.js"
import {
  tickets,
  users,
} from "../../db/schema/index.js"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { type DbTransaction } from "../audit/audit.service.js"
import { MAX_TAT_HOURS } from "../../utils/tatLimits.js"
import { AppError } from "../../utils/AppError.js"

export type TicketRow = typeof tickets.$inferSelect

export const NOT_DELETED = isNull(tickets.deletedAt)

export const NOT_GATED = and(eq(tickets.awaitingHeadApproval, false), isNull(tickets.declinedAt))

export const CLAIM_POOL = and(isNotNull(tickets.claimOpenedAt), isNull(tickets.assigneeId), eq(tickets.status, "OPEN"), eq(tickets.awaitingHeadApproval, false), isNull(tickets.declinedAt), isNull(tickets.deletedAt))!

export const AWAITING_CLAIM = and(isNotNull(tickets.claimOpenedAt), isNull(tickets.claimedAt), eq(tickets.status, "OPEN"), eq(tickets.awaitingHeadApproval, false), isNull(tickets.declinedAt), isNull(tickets.deletedAt))!

type ClaimState = Pick<TicketRow, "claimOpenedAt" | "claimedAt" | "assigneeId" | "status" | "awaitingHeadApproval" | "declinedAt">

export const inClaimPool = (ticket: Omit<ClaimState, "claimedAt">): boolean =>
  !!ticket.claimOpenedAt && !ticket.assigneeId && ticket.status === "OPEN" && !ticket.awaitingHeadApproval && !ticket.declinedAt

export const awaitingClaim = (ticket: ClaimState): boolean =>
  !!ticket.claimOpenedAt && !ticket.claimedAt && ticket.status === "OPEN" && !ticket.awaitingHeadApproval && !ticket.declinedAt

export const awaitingAssigneeClaim = (ticket: ClaimState): boolean => awaitingClaim(ticket) && !!ticket.assigneeId

export type ClaimHandOff = { claimOpenedAt: Date; claimedAt: Date | null; tatDueAt: Date | null }

export const claimHandOff = (assigneeId: string | null, actorId: string, tatHours: number | null, now: Date): ClaimHandOff => {
  const takenBySelf = !!assigneeId && assigneeId === actorId
  return { claimOpenedAt: now, claimedAt: takenBySelf ? now : null, tatDueAt: takenBySelf ? deriveTatDueAt(tatHours, now) : null }
}

export const headClaimBlock = (ticket: Pick<TicketRow, "headClaimedBy">, actorId: string, orgWide: boolean): boolean =>
  !!ticket.headClaimedBy && ticket.headClaimedBy !== actorId && !orgWide

export const deriveTatDueAt = (tatHours: number | null, fromDate: Date): Date | null =>
  tatHours ? new Date(fromDate.getTime() + Math.min(tatHours, MAX_TAT_HOURS) * 60 * 60 * 1000) : null

export const assertAssignableUser = async (userId: string) => {
  const [person] = await db.select({ isActive: users.isActive, role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
  if (!person || !person.isActive || person.role === "OWNER") {
    throw AppError.badRequest("That person can't be given tickets. Pick someone else.")
  }
}

export const overdueAtHandOver = (alreadyOverdue: boolean, tatDueAt: Date | null, now: Date): boolean =>
  alreadyOverdue || (tatDueAt !== null && tatDueAt.getTime() < now.getTime())

export const round1 = (n: number) => Math.round(n * 10) / 10

export const userCols = { id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role } as const

export const groupBy = <T, K>(rows: T[], keyFn: (row: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyFn(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

export type Executor = typeof db | DbTransaction
