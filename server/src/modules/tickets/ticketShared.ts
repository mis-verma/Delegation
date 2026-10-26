import { db } from "../../config/db.js"
import {
  tickets,
  users,
} from "../../db/schema/index.js"
import { and, eq, isNull } from "drizzle-orm"
import { type DbTransaction } from "../audit/audit.service.js"

export type TicketRow = typeof tickets.$inferSelect

export const NOT_DELETED = isNull(tickets.deletedAt)

export const NOT_GATED = and(eq(tickets.awaitingHeadApproval, false), isNull(tickets.declinedAt))

export const deriveTatDueAt = (tatHours: number | null, fromDate: Date): Date | null =>
  tatHours ? new Date(fromDate.getTime() + tatHours * 60 * 60 * 1000) : null

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
