import { db } from "../../config/db.js"
import {
  tickets,
  ticketStatusUpdates,
  users,
} from "../../db/schema/index.js"
import { eq, and, or, inArray, asc, sql, type SQL } from "drizzle-orm"
import { cached, cacheKey, bumpVersions, versionTag } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { resolveReportRange, bucketSql, utcSql, type ReportGroupBy } from "../checklistInstances/checklistReportRange.js"
import { isAdminOrPc } from "../../utils/roles.js"
import { dropScoreCache } from "../scores/scoreCache.js"
import { NOT_DELETED, NOT_GATED, round1 } from "./ticketShared.js"
import { visibilityFilter } from "./ticketAccess.js"

export type OwnerStatsRow = {
  ownerId: string | null
  total: number
  closed: number
  overdueCount: number
  avgTatHours: number | null
  closedInPeriod: number
  closedWithTat: number
  closedOnTime: number
  closedLate: number
  createdCount: number
  createdAndClosedCount: number
  closedDueInWindowCount: number
  volume: number
  windowDefaulted: false
}

export type TicketPendingApprovalRow = {
  id: string
  title: string
  submittedBy: string | null
  waitingSince: string
}

export type TicketSummaryRow = {
  total: number
  pending: number
  newToday: number
  due: number
  overdue: number
  completed: number
}

export type TicketSummaryScope = "mine" | "visible"

export const TICKET_SUMMARY_PREFIX = "ticket-summary"
export const SUMMARY_TTL_SECONDS = 10

export const TICKET_SUMMARY_VERSION = `${TICKET_SUMMARY_PREFIX}:all`
export const dropTicketSummaries = async () => {
  await Promise.all([bumpVersions(TICKET_SUMMARY_VERSION), dropScoreCache()])
}

export const ownerStatsByColumn = async (
  column: SQL,
  scopeConditions: SQL[],
  window: { from?: Date; to?: Date },
  grouped: boolean,
): Promise<OwnerStatsRow[]> => {
  const inWindow = (col: string): SQL => {
    const parts: SQL[] = []
    if (window.from) parts.push(sql`${sql.raw(col)} >= ${utcSql(window.from)}`)
    if (window.to) parts.push(sql`${sql.raw(col)} <= ${utcSql(window.to)}`)
    return parts.length ? sql`(${sql.join(parts, sql` AND `)})` : sql`(1 = 1)`
  }
  const createdIn = inWindow("tickets.createdAt")
  const closedIn = sql`(tickets.closedAt IS NOT NULL AND ${inWindow("tickets.closedAt")})`
  const closedDueIn = sql`(tickets.status = 'CLOSED' AND tickets.closedAt IS NOT NULL AND tickets.tatDueAt IS NOT NULL AND ${inWindow("tickets.tatDueAt")})`
  const hasWindow = Boolean(window.from || window.to)

  const conditions: SQL[] = [sql`tickets.deletedAt IS NULL`, sql`tickets.declinedAt IS NULL`, sql`tickets.awaitingHeadApproval = 0`, ...scopeConditions]
  if (hasWindow) conditions.push(sql`(${createdIn} OR ${closedIn} OR ${closedDueIn})`)
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`
  const groupBy = grouped ? sql`GROUP BY ownerId` : sql``

  const [rows] = await db.execute(sql`
    SELECT
      ${column} AS ownerId,
      COALESCE(SUM(${createdIn} OR ${closedIn} OR ${closedDueIn}), 0) AS volume,
      COALESCE(SUM(${createdIn}), 0) AS total,
      COALESCE(SUM(${createdIn} AND tickets.status = 'CLOSED'), 0) AS closed,
      COALESCE(SUM(${createdIn} AND tickets.isOverdue = 1 AND tickets.status NOT IN ('CLOSED', 'PENDING_APPROVAL')), 0) AS overdueCount,
      COALESCE(SUM(${closedIn}), 0) AS closedInPeriod,
      COALESCE(SUM(${closedDueIn}), 0) AS closedWithTat,
      COALESCE(SUM(${closedDueIn} AND COALESCE(tickets.submittedAt, tickets.closedAt) <= tickets.tatDueAt), 0) AS closedOnTime,
      COALESCE(SUM(${closedDueIn} AND COALESCE(tickets.submittedAt, tickets.closedAt) > tickets.tatDueAt), 0) AS closedLate,
      AVG(CASE WHEN ${closedIn} THEN TIMESTAMPDIFF(SECOND, tickets.createdAt, tickets.closedAt) / 3600 END) AS avgTatHours
    FROM Ticket tickets
    ${where}
    ${groupBy}
  `)

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    ownerId: r.ownerId != null ? String(r.ownerId) : null,
    total: Number(r.total),
    closed: Number(r.closed),
    overdueCount: Number(r.overdueCount),
    avgTatHours: r.avgTatHours != null ? round1(Number(r.avgTatHours)) : null,
    closedInPeriod: Number(r.closedInPeriod),
    closedWithTat: Number(r.closedWithTat),
    closedOnTime: Number(r.closedOnTime),
    closedLate: Number(r.closedLate),
    createdCount: Number(r.total),
    createdAndClosedCount: Number(r.closed),
    closedDueInWindowCount: Number(r.closedWithTat),
    volume: Number(r.volume),
    windowDefaulted: false as const,
  }))
}

export const tatReport = async (groupBy: ReportGroupBy, from?: string, to?: string, departmentId?: string, storeId?: string) => {
  const range = resolveReportRange(groupBy, from, to)

  const scope: SQL[] = [sql`tickets.deletedAt IS NULL`, sql`tickets.declinedAt IS NULL`]
  if (departmentId) scope.push(sql`tickets.departmentId = ${departmentId}`)
  if (storeId) scope.push(sql`tickets.storeId = ${storeId}`)

  const closedWhere = sql`WHERE ${sql.join([
    ...scope,
    sql`tickets.closedAt IS NOT NULL`,
    sql`tickets.closedAt >= ${utcSql(range.from)}`,
    sql`tickets.closedAt <= ${utcSql(range.to)}`,
  ], sql` AND `)}`
  const createdWhere = sql`WHERE ${sql.join([
    ...scope,
    sql`tickets.createdAt >= ${utcSql(range.from)}`,
    sql`tickets.createdAt <= ${utcSql(range.to)}`,
  ], sql` AND `)}`
  const dueWhere = sql`WHERE ${sql.join([
    ...scope,
    sql`tickets.status = 'CLOSED'`,
    sql`tickets.closedAt IS NOT NULL`,
    sql`tickets.tatDueAt IS NOT NULL`,
    sql`tickets.tatDueAt >= ${utcSql(range.from)}`,
    sql`tickets.tatDueAt <= ${utcSql(range.to)}`,
  ], sql` AND `)}`

  const [closedRows] = await db.execute(sql`
    SELECT
      ${bucketSql(groupBy, sql`tickets.closedAt`)} AS bucket,
      COUNT(*) AS closedCount,
      AVG(TIMESTAMPDIFF(SECOND, tickets.createdAt, tickets.closedAt) / 3600) AS avgTatHours
    FROM Ticket tickets
    ${closedWhere}
    GROUP BY bucket
  `)

  const [dueRows] = await db.execute(sql`
    SELECT
      ${bucketSql(groupBy, sql`tickets.tatDueAt`)} AS bucket,
      COUNT(*) AS closedWithTatCount,
      COALESCE(SUM(COALESCE(tickets.submittedAt, tickets.closedAt) <= tickets.tatDueAt), 0) AS closedOnTimeCount,
      COALESCE(SUM(COALESCE(tickets.submittedAt, tickets.closedAt) > tickets.tatDueAt), 0) AS closedLateCount
    FROM Ticket tickets
    ${dueWhere}
    GROUP BY bucket
  `)

  const [createdRows] = await db.execute(sql`
    SELECT
      ${bucketSql(groupBy, sql`tickets.createdAt`)} AS bucket,
      COUNT(*) AS createdCount,
      COALESCE(SUM(tickets.isOverdue = 1 AND tickets.status NOT IN ('CLOSED', 'PENDING_APPROVAL')), 0) AS overdueCount
    FROM Ticket tickets
    ${createdWhere}
    GROUP BY bucket
  `)

  type ClosedAgg = { closedCount: number; avgTatHours: number | null }
  const closedByBucket = new Map<string, ClosedAgg>(
    (closedRows as unknown as Record<string, unknown>[]).map((r) => [String(r.bucket), {
      closedCount: Number(r.closedCount),
      avgTatHours: r.avgTatHours != null ? Number(r.avgTatHours) : null,
    }]),
  )
  type DueAgg = { closedWithTatCount: number; closedOnTimeCount: number; closedLateCount: number }
  const dueByBucket = new Map<string, DueAgg>(
    (dueRows as unknown as Record<string, unknown>[]).map((r) => [String(r.bucket), {
      closedWithTatCount: Number(r.closedWithTatCount),
      closedOnTimeCount: Number(r.closedOnTimeCount),
      closedLateCount: Number(r.closedLateCount),
    }]),
  )
  const createdByBucket = new Map<string, { createdCount: number; overdueCount: number }>(
    (createdRows as unknown as Record<string, unknown>[]).map((r) => [String(r.bucket), {
      createdCount: Number(r.createdCount),
      overdueCount: Number(r.overdueCount),
    }]),
  )

  return range.buckets.map((bucket) => {
    const closed = closedByBucket.get(bucket)
    const due = dueByBucket.get(bucket)
    const created = createdByBucket.get(bucket)
    const createdCount = created?.createdCount ?? 0
    const closedCount = closed?.closedCount ?? 0
    const completionRate = createdCount === 0
      ? null
      : round1((closedCount / createdCount) * 100)
    return {
      bucket,
      createdCount,
      closedCount,
      avgTatHours: closed?.avgTatHours != null ? round1(closed.avgTatHours) : null,
      overdueCount: created?.overdueCount ?? 0,
      closedLateCount: due?.closedLateCount ?? 0,
      closedOnTimeCount: due?.closedOnTimeCount ?? 0,
      closedWithTatCount: due?.closedWithTatCount ?? 0,
      completionRate,
      closedVsCreatedPct: completionRate,
    }
  })
}

export const ownerStats = async (scope: "department" | "store" | "user" | "org", from?: string, to?: string, departmentId?: string, storeId?: string): Promise<OwnerStatsRow[]> => {
  const scopeConditions: SQL[] = []
  if (departmentId) scopeConditions.push(sql`tickets.departmentId = ${departmentId}`)
  if (storeId) scopeConditions.push(sql`tickets.storeId = ${storeId}`)
  const window = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }

  if (scope === "department") return ownerStatsByColumn(sql`tickets.departmentId`, scopeConditions, window, true)
  if (scope === "store") return ownerStatsByColumn(sql`tickets.storeId`, scopeConditions, window, true)
  if (scope === "org") return ownerStatsByColumn(sql`NULL`, scopeConditions, window, false)
  return ownerStatsByColumn(sql`tickets.assigneeId`, [...scopeConditions, sql`tickets.assigneeId IS NOT NULL`], window, true)
}

export const summary = async (user: AccessTokenPayload, scope: TicketSummaryScope = "mine"): Promise<TicketSummaryRow> => {
  const version = await versionTag(TICKET_SUMMARY_VERSION)
  return cached(cacheKey(TICKET_SUMMARY_PREFIX, `v${version}`, scope, user.sub), SUMMARY_TTL_SECONDS, async () => {
    const scopeCondition = scope === "visible"
      ? await visibilityFilter(user)
      : or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))
    const where = and(NOT_DELETED, NOT_GATED, scopeCondition)

    const [row] = await db.select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${tickets.status} IN ('CLOSED', 'PENDING_APPROVAL') THEN 1 ELSE 0 END)`,
      overdue: sql<number>`SUM(CASE WHEN ${tickets.isOverdue} AND ${tickets.status} NOT IN ('CLOSED', 'PENDING_APPROVAL') THEN 1 ELSE 0 END)`,
      newToday: sql<number>`SUM(CASE WHEN ${tickets.createdAt} >= ${utcSql(orgDayStartUtc())} THEN 1 ELSE 0 END)`,
    }).from(tickets).where(where)

    const total = Number(row?.total ?? 0)
    const completed = Number(row?.completed ?? 0)
    const overdue = Number(row?.overdue ?? 0)
    return {
      total,
      pending: total - completed,
      newToday: Number(row?.newToday ?? 0),
      due: total - completed - overdue,
      overdue,
      completed,
    }
  })
}

export const pendingApproval = async (user: AccessTokenPayload, limit = 8): Promise<{ data: TicketPendingApprovalRow[]; meta: { total: number } }> => {
  const POOL = 40
  const stageScope = isAdminOrPc(user.role) ? undefined : sql`1 = 0`
  const pendingWhere = and(eq(tickets.status, "PENDING_APPROVAL"), NOT_DELETED, stageScope)
  const [countRow] = await db.select({ total: sql<number>`COUNT(*)` }).from(tickets).where(pendingWhere)
  const total = Number(countRow?.total ?? 0)
  const rows = await db.select({
    id: tickets.id,
    title: tickets.title,
    createdAt: tickets.createdAt,
    firstName: users.firstName,
    lastName: users.lastName,
  })
    .from(tickets)
    .leftJoin(users, eq(tickets.userId, users.id))
    .where(pendingWhere)
    .orderBy(asc(tickets.createdAt))
    .limit(POOL)

  if (rows.length === 0) return { data: [], meta: { total } }

  const ids = rows.map((r) => r.id)
  const sinceRows = await db.select({
    ticketId: ticketStatusUpdates.ticketId,
    since: sql<string>`MAX(${ticketStatusUpdates.createdAt})`,
  })
    .from(ticketStatusUpdates)
    .where(and(inArray(ticketStatusUpdates.ticketId, ids), eq(ticketStatusUpdates.toStatus, "PENDING_APPROVAL")))
    .groupBy(ticketStatusUpdates.ticketId)
  const sinceById = new Map(sinceRows.map((r) => [r.ticketId, r.since]))

  const data = rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      submittedBy: r.firstName ? `${r.firstName}${r.lastName ? ` ${r.lastName}` : ""}` : null,
      waitingSince: new Date(sinceById.get(r.id) ?? r.createdAt).toISOString(),
    }))
    .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
    .slice(0, limit)
  return { data, meta: { total } }
}
