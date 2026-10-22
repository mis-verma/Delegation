import path from "node:path"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import {
  tickets,
  ticketTags,
  tags,
  ticketStatusUpdates,
  ticketAttachments,
  ticketComments,
  ticketReviewers,
  checklists,
  checklistItems,
  checklistImages,
  users,
} from "../../db/schema/index.js"
import { eq, and, or, inArray, desc, asc, sql, isNull, gte, lte, ne, isNotNull, type SQL } from "drizzle-orm"
import { env } from "../../config/env.js"
import { cached, cacheKey, bumpVersions, versionTag } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTicketInput, UpdateTicketInput, VerifyTicketInput, StatusUpdateInput } from "./ticket.validation.js"
import { auditService, type DbTransaction } from "../audit/audit.service.js"
import { emitTicketEvent } from "../../sockets/ticketEvent.js"
import { resolveReportRange, bucketSql, utcSql, type ReportGroupBy } from "../checklistInstances/checklistReportRange.js"
import { resolveReportScope } from "../../utils/reportScope.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { settingsService } from "../settings/settings.service.js"
import { canApproveAtStage, assignmentNeedsHeadApproval, canApproveAssignment, isDepartmentHead, type ApprovalStage } from "./ticketApproval.js"

type TicketRow = typeof tickets.$inferSelect

const NOT_DELETED = isNull(tickets.deletedAt)

const deriveTatDueAt = (tatHours: number | null, fromDate: Date): Date | null =>
  tatHours ? new Date(fromDate.getTime() + tatHours * 60 * 60 * 1000) : null

const overdueAtHandOver = (alreadyOverdue: boolean, tatDueAt: Date | null, now: Date): boolean =>
  alreadyOverdue || (tatDueAt !== null && tatDueAt.getTime() < now.getTime())

const round1 = (n: number) => Math.round(n * 10) / 10

const userCols = { id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role } as const

const groupBy = <T, K>(rows: T[], keyFn: (row: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyFn(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

const tagsByTicket = async (ticketIds: string[]) => {
  const byTicket = new Map<string, { id: string; name: string; color: string | null }[]>()
  if (!ticketIds.length) return byTicket

  const rows = await db.select({
    ticketId: ticketTags.ticketId,
    id: tags.id,
    name: tags.name,
    color: tags.color,
  })
    .from(ticketTags)
    .innerJoin(tags, eq(ticketTags.tagId, tags.id))
    .where(inArray(ticketTags.ticketId, ticketIds))
    .orderBy(asc(tags.name))

  for (const row of rows) {
    const list = byTicket.get(row.ticketId) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    byTicket.set(row.ticketId, list)
  }
  return byTicket
}

type Executor = typeof db | DbTransaction

const syncTicketTags = async (executor: Executor, ticketId: string, tagIds: string[]) => {
  await executor.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId))
  if (!tagIds.length) return

  const unique = [...new Set(tagIds)]
  const existing = await executor.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique))
  if (!existing.length) return

  await executor.insert(ticketTags).values(existing.map((tag) => ({ ticketId, tagId: tag.id })))
}

const ticketTagIds = async (ticketId: string): Promise<string[]> =>
  (await db.select({ tagId: ticketTags.tagId }).from(ticketTags).where(eq(ticketTags.ticketId, ticketId)))
    .map((r) => r.tagId).sort()

const ticketReviewerIds = async (ticketId: string): Promise<string[]> =>
  (await db.select({ userId: ticketReviewers.userId }).from(ticketReviewers).where(eq(ticketReviewers.ticketId, ticketId)))
    .map((r) => r.userId).sort()

const reviewerTicketIds = async (userId: string): Promise<string[]> => {
  const rows = await db.select({ ticketId: ticketReviewers.ticketId }).from(ticketReviewers).where(eq(ticketReviewers.userId, userId))
  return rows.map((r) => r.ticketId)
}

const syncTicketReviewers = async (executor: Executor, ticketId: string, userIds: string[]) => {
  await executor.delete(ticketReviewers).where(eq(ticketReviewers.ticketId, ticketId))
  if (!userIds.length) return
  const unique = [...new Set(userIds)]
  await executor.insert(ticketReviewers).values(unique.map((userId) => ({ ticketId, userId })))
}

const reviewersByTicket = async (ticketIds: string[]) => {
  const byTicket = new Map<string, { id: string; firstName: string; lastName: string | null; email: string }[]>()
  if (!ticketIds.length) return byTicket

  const rows = await db.select({
    ticketId: ticketReviewers.ticketId,
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
  })
    .from(ticketReviewers)
    .innerJoin(users, eq(ticketReviewers.userId, users.id))
    .where(inArray(ticketReviewers.ticketId, ticketIds))

  for (const row of rows) {
    const list = byTicket.get(row.ticketId) ?? []
    list.push({ id: row.id, firstName: row.firstName, lastName: row.lastName, email: row.email })
    byTicket.set(row.ticketId, list)
  }
  return byTicket
}

const populateTickets = async (ticketRows: TicketRow[]) => {
  if (!ticketRows.length) return []
  const ticketIds = ticketRows.map((t) => t.id)

  const userIds = [...new Set(ticketRows.flatMap((t) => [t.assigneeId, t.userId, t.verifiedBy, t.hodApprovedBy, t.declinedBy, t.assignmentApprovedBy]).filter((v): v is string => Boolean(v)))]
  const userRows = userIds.length ? await db.select(userCols).from(users).where(inArray(users.id, userIds)) : []
  const userById = new Map(userRows.map((u) => [u.id, u]))

  const tagsByTicketMap = await tagsByTicket(ticketIds)
  const reviewersByTicketMap = await reviewersByTicket(ticketIds)

  const checklistRows = await db.select().from(checklists).where(inArray(checklists.ticketId, ticketIds))
  const checklistIds = checklistRows.map((c) => c.id)
  const itemRows = checklistIds.length ? await db.select().from(checklistItems).where(inArray(checklistItems.checklistId, checklistIds)) : []
  const itemIds = itemRows.map((i) => i.id)
  const imageRows = itemIds.length ? await db.select().from(checklistImages).where(inArray(checklistImages.checklistItemId, itemIds)) : []

  const imagesByItem = groupBy(imageRows, (i) => i.checklistItemId)
  const itemsByChecklist = groupBy(itemRows.map((i) => ({ ...i, images: imagesByItem.get(i.id) ?? [] })), (i) => i.checklistId)
  const checklistsByTicket = groupBy(checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] })), (c) => c.ticketId)

  const attachmentRows = await db
    .select({ attachment: ticketAttachments, uploadedByUser: userCols })
    .from(ticketAttachments)
    .leftJoin(users, eq(ticketAttachments.uploadedBy, users.id))
    .where(inArray(ticketAttachments.ticketId, ticketIds))
  const attachmentsByTicket = groupBy(
    attachmentRows.map((r) => ({ ...r.attachment, uploadedByUser: r.uploadedByUser })),
    (a) => a.ticketId,
  )

  const commentRows = await db
    .select({ comment: ticketComments, author: userCols })
    .from(ticketComments)
    .leftJoin(users, eq(ticketComments.authorId, users.id))
    .where(inArray(ticketComments.ticketId, ticketIds))
    .orderBy(asc(ticketComments.createdAt))
  const commentsByTicket = groupBy(commentRows.map((r) => ({ ...r.comment, author: r.author })), (c) => c.ticketId)

  const statusUpdateRows = await db
    .select({ statusUpdate: ticketStatusUpdates, changedByUser: userCols })
    .from(ticketStatusUpdates)
    .leftJoin(users, eq(ticketStatusUpdates.changedBy, users.id))
    .where(inArray(ticketStatusUpdates.ticketId, ticketIds))
    .orderBy(desc(ticketStatusUpdates.createdAt))
  const statusUpdateIds = statusUpdateRows.map((r) => r.statusUpdate.id)
  const photoRows = statusUpdateIds.length
    ? await db.select().from(ticketAttachments).where(inArray(ticketAttachments.statusUpdateId, statusUpdateIds))
    : []
  const photosByStatusUpdate = groupBy(photoRows, (p) => p.statusUpdateId as string)
  const statusUpdatesByTicket = groupBy(
    statusUpdateRows.map((r) => ({
      ...r.statusUpdate,
      changedByUser: r.changedByUser,
      photos: photosByStatusUpdate.get(r.statusUpdate.id) ?? [],
    })),
    (su) => su.ticketId,
  )

  return ticketRows.map((t) => ({
    ...t,
    assignee: t.assigneeId ? userById.get(t.assigneeId) ?? null : null,
    raisedBy: userById.get(t.userId) ?? null,
    verifier: t.verifiedBy ? userById.get(t.verifiedBy) ?? null : null,
    hodApprover: t.hodApprovedBy ? userById.get(t.hodApprovedBy) ?? null : null,
    decliner: t.declinedBy ? userById.get(t.declinedBy) ?? null : null,
    assignmentApprover: t.assignmentApprovedBy ? userById.get(t.assignmentApprovedBy) ?? null : null,
    checklists: checklistsByTicket.get(t.id) ?? [],
    attachments: attachmentsByTicket.get(t.id) ?? [],
    comments: commentsByTicket.get(t.id) ?? [],
    statusUpdates: statusUpdatesByTicket.get(t.id) ?? [],
    tags: tagsByTicketMap.get(t.id) ?? [],
    reviewers: reviewersByTicketMap.get(t.id) ?? [],
  }))
}

const getPopulatedTicket = async (id: string) => {
  const [row] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
  if (!row) return undefined
  const [populated] = await populateTickets([row])
  return populated
}

const getTicketChecklistsWithItems = async (ticketId: string) => {
  const checklistRows = await db.select().from(checklists).where(eq(checklists.ticketId, ticketId))
  const checklistIds = checklistRows.map((c) => c.id)
  const itemRows = checklistIds.length ? await db.select().from(checklistItems).where(inArray(checklistItems.checklistId, checklistIds)) : []
  const itemsByChecklist = groupBy(itemRows, (i) => i.checklistId)
  return checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }))
}

export const visibilityFilter = async (user: AccessTokenPayload) => {
  if (user.role === "ADMIN" || user.role === "PC" || user.role === "APPROVAL_MANAGER") return undefined

  let base: ReturnType<typeof or>

  if (user.role === "MANAGER") {
    const or_conditions = [eq(tickets.userId, user.sub)]
    if (user.departmentId) or_conditions.push(eq(tickets.departmentId, user.departmentId))
    if (user.storeId) or_conditions.push(eq(tickets.storeId, user.storeId))
    base = or(...or_conditions)
  } else if (user.role === "SENIOR") {
    base = user.storeId ? eq(tickets.storeId, user.storeId) : eq(tickets.userId, user.sub)
  } else if (user.role === "AGENT" || user.role === "USER") {
    base = or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))!
  } else {
    base = eq(tickets.userId, user.sub)
  }

  const reviewedIds = await reviewerTicketIds(user.sub)
  return reviewedIds.length ? or(base!, inArray(tickets.id, reviewedIds)) : base
}

const assertCanVerify = async (
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

const isSameDeptOrStore = (user: AccessTokenPayload, ticket: Pick<TicketRow, "departmentId" | "storeId">) => {
  const sameDept = Boolean(user.departmentId) && ticket.departmentId === user.departmentId
  const sameStore = Boolean(user.storeId) && ticket.storeId === user.storeId
  return sameDept || sameStore
}

export const assertCanMutate = (user: AccessTokenPayload, ticket: Pick<TicketRow, "userId" | "assigneeId" | "departmentId" | "storeId">) => {
  if (user.role === "ADMIN" || user.role === "PC") return
  if (user.role === "AGENT" || user.role === "USER") {
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

const isVerifierRole = (user: AccessTokenPayload) => user.role === "ADMIN" || user.role === "PC"

const assertCanSetReviewers = (reviewerIds: string[] | undefined, user: AccessTokenPayload) => {
  if (reviewerIds !== undefined && !isVerifierRole(user)) {
    throw AppError.forbidden("Only an admin or PC can choose who reviews a ticket.")
  }
}

const notificationTarget = (ticket: Pick<TicketRow, "id" | "title" | "departmentId" | "storeId" | "userId" | "assigneeId">) => ({
  _id: ticket.id,
  title: ticket.title,
  departmentId: ticket.departmentId,
  storeId: ticket.storeId,
  userId: ticket.userId,
  assigneeId: ticket.assigneeId,
})

const roomTarget = (ticket: Pick<TicketRow, "userId" | "assigneeId" | "departmentId" | "storeId">) => ({
  userId: ticket.userId,
  assigneeId: ticket.assigneeId ?? null,
  departmentId: ticket.departmentId ?? null,
  storeId: ticket.storeId ?? null,
})

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

const TICKET_SUMMARY_PREFIX = "ticket-summary"
const SUMMARY_TTL_SECONDS = 10

const TICKET_SUMMARY_VERSION = `${TICKET_SUMMARY_PREFIX}:all`
const dropTicketSummaries = () => bumpVersions(TICKET_SUMMARY_VERSION)

const ownerStatsByColumn = async (
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

  const conditions: SQL[] = [sql`tickets.deletedAt IS NULL`, sql`tickets.declinedAt IS NULL`, ...scopeConditions]
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

export const ticketService = {
  async list(user: AccessTokenPayload, page: number, limit: number, status?: string, assigneeId?: string, overdue?: boolean, from?: string, to?: string, dateField: "createdAt" | "closedAt" | "tatDueAt" = "createdAt", sla?: "overdue_open" | "closed_late" | "closed_on_time") {
    const conditions = [NOT_DELETED]
    const vis = await visibilityFilter(user)
    if (vis) conditions.push(vis)
    if (status) conditions.push(eq(tickets.status, status as TicketRow["status"]))
    if (assigneeId && user.role !== "USER" && user.role !== "AGENT") {
      conditions.push(eq(tickets.assigneeId, assigneeId))
    }
    if (overdue !== undefined) conditions.push(eq(tickets.isOverdue, overdue))
    const dateColumn = dateField === "closedAt" ? tickets.closedAt : dateField === "tatDueAt" ? tickets.tatDueAt : tickets.createdAt
    if (from) conditions.push(gte(dateColumn, new Date(from)))
    if (to) conditions.push(lte(dateColumn, new Date(to)))
    if (sla) {
      const scope = resolveReportScope(user, {})
      if (scope.departmentId) conditions.push(eq(tickets.departmentId, scope.departmentId))
      if (scope.storeId) conditions.push(eq(tickets.storeId, scope.storeId))
    }
    if (sla === "overdue_open") conditions.push(eq(tickets.isOverdue, true), ne(tickets.status, "CLOSED"), ne(tickets.status, "PENDING_APPROVAL"))
    if (sla === "closed_late") conditions.push(inArray(tickets.status, ["CLOSED", "PENDING_APPROVAL"]), isNotNull(tickets.tatDueAt), sql`COALESCE(${tickets.submittedAt}, ${tickets.closedAt}) > ${tickets.tatDueAt}`)
    if (sla === "closed_on_time") conditions.push(inArray(tickets.status, ["CLOSED", "PENDING_APPROVAL"]), isNotNull(tickets.tatDueAt), sql`COALESCE(${tickets.submittedAt}, ${tickets.closedAt}) <= ${tickets.tatDueAt}`)
    const where = conditions.length ? and(...conditions) : undefined

    const [rows, totalRows] = await Promise.all([
      db.select().from(tickets).where(where).orderBy(desc(tickets.createdAt)).offset((page - 1) * limit).limit(limit),
      db.select({ count: sql<number>`count(*)` }).from(tickets).where(where),
    ])
    const data = await populateTickets(rows)
    const total = Number(totalRows[0]?.count ?? 0)
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
    }
  },

  async getById(id: string, user: AccessTokenPayload) {
    const ticket = await getPopulatedTicket(id)

    if (!ticket) throw AppError.notFound("Ticket not found");
    if (user.role !== "ADMIN" && user.role !== "PC") {
      const vis = await visibilityFilter(user)
      const conditions = [eq(tickets.id, id), NOT_DELETED]
      if (vis) conditions.push(vis)
      const [visible] = await db.select({ id: tickets.id }).from(tickets).where(and(...conditions)).limit(1)

      if (!visible) throw AppError.forbidden();
    }
    return ticket;
  },

  async create(input: CreateTicketInput, user: AccessTokenPayload, hooks?: { inTransaction?: (tx: DbTransaction, ticketId: string) => Promise<void> }) {
    assertCanSetReviewers(input.reviewerIds, user)
    const tatHours = input.tatHours ?? settingsService.getCached().defaultTatHours
    const id = createId()
    const now = new Date()
    const needsHead = await assignmentNeedsHeadApproval({ departmentId: input.departmentId ?? null }, user)
    await db.transaction(async (tx) => {
      await tx.insert(tickets).values({
        id,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assignmentMode: input.assignmentMode,
        assigneeId: input.assigneeId ?? null,
        storeId: input.storeId ?? null,
        categoryId: input.categoryId ?? null,
        departmentId: input.departmentId ?? null,
        tatHours: tatHours ?? null,
        tatDueAt: deriveTatDueAt(tatHours ?? null, now),
        startDate: input.startDate ? new Date(input.startDate) : null,
        isOverdue: false,
        awaitingHeadApproval: needsHead,
        userId: user.sub,
      })

      if (input.tagIds?.length) await syncTicketTags(tx, id, input.tagIds)
      if (input.reviewerIds?.length) await syncTicketReviewers(tx, id, input.reviewerIds)
      await hooks?.inTransaction?.(tx, id)
    })

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "CREATE",
      actorId: user.sub,
      after: { ...afterRow, tagIds: [...(input.tagIds ?? [])].sort(), reviewerIds: [...(input.reviewerIds ?? [])].sort() },
    })

    const populated = await getPopulatedTicket(id)
    emitTicketEvent("ticket:created", roomTarget(afterRow!), populated)

    if (needsHead) {
      await notifySafely(() => notificationService.notifyTicketAwaitingHead(notificationTarget(afterRow!)))
    } else if (afterRow!.assigneeId) {
      await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)))
    } else {
      await notifySafely(() => notificationService.notifyTicketUnassigned({ _id: id, title: afterRow!.title, departmentId: afterRow!.departmentId }, user.sub))
    }

    await dropTicketSummaries()
    return populated;
  },

  async update(id: string, input: UpdateTicketInput, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    assertCanMutate(user, ticket)

    if (ticket.declinedAt && input.status !== undefined && input.status !== ticket.status) {
      throw AppError.badRequest("This ticket was declined. Use Reopen ticket to bring it back.")
    }

    if ((input.assigneeId !== undefined || input.departmentId !== undefined) && (user.role === "AGENT" || user.role === "USER")) {
      throw AppError.forbidden("Only a manager or above can reassign a ticket's assignee or department.")
    }
    assertCanSetReviewers(input.reviewerIds, user)

    if (input.priority !== undefined && input.priority !== ticket.priority && (user.role === "AGENT" || user.role === "USER")) {
      throw AppError.forbidden("Only a manager or above can change a ticket's priority.")
    }

    if (input.status !== undefined && input.status !== ticket.status) {
      if (!isVerifierRole(user)) throw AppError.forbidden("Use the status buttons to move this ticket.")
      if (input.status !== "OPEN") throw AppError.badRequest("Use the status buttons to move this ticket.")
    }

    if (input.tatHours !== undefined && input.tatHours !== ticket.tatHours) {
      if (user.role === "USER" || user.role === "AGENT") {
        throw AppError.forbidden("Only a manager or above can change a ticket's due time.")
      }
      if (ticket.status === "CLOSED" || ticket.status === "PENDING_APPROVAL") {
        throw AppError.badRequest("The due time can't change once the ticket is handed in or closed.")
      }
    }

    const before = ticket;
    const beforeTagIds = await ticketTagIds(id);
    const beforeReviewerIds = await ticketReviewerIds(id);

    if (input.tagIds !== undefined) {
      const keep = new Set(input.tagIds)
      if (beforeTagIds.some((tagId) => !keep.has(tagId))) {
        throw AppError.forbidden("A label can't be removed from a ticket once it is added.")
      }
    }

    const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() }
    if (input.title !== undefined) patch.title = input.title
    if (input.description !== undefined) patch.description = input.description
    if (input.priority !== undefined) patch.priority = input.priority
    if (input.assignmentMode !== undefined) patch.assignmentMode = input.assignmentMode
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId
    if (input.storeId !== undefined) patch.storeId = input.storeId
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId
    if (input.departmentId !== undefined) patch.departmentId = input.departmentId
    if (input.status !== undefined) patch.status = input.status
    if (input.status !== undefined && (before.status === "CLOSED" || before.status === "PENDING_APPROVAL") && input.status !== "CLOSED" && input.status !== "PENDING_APPROVAL") {
      patch.reopenCount = before.reopenCount + 1
    }

    if (input.status === "CLOSED" && before.status !== "CLOSED") {
      throw AppError.badRequest("A ticket is closed by approving it. Mark it completed first, then approve it.")
    } else if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      const checklistsWithItems = await getTicketChecklistsWithItems(id)
      assertChecklistsResolved(checklistsWithItems, "sending this ticket for review")
    } else if (input.status && input.status !== "CLOSED" && before.status === "CLOSED") {
      if (user.role !== "ADMIN" && user.role !== "PC") {
        throw AppError.forbidden("Only an admin or PC can reopen a closed ticket.")
      }
      patch.closedAt = null;
      patch.verifiedBy = null;
      patch.verifiedAt = null;
      patch.verificationNote = null;
    }

    if (input.startDate !== undefined) {
      patch.startDate = input.startDate ? new Date(input.startDate) : null
    }

    const nextDepartmentId = patch.departmentId !== undefined ? patch.departmentId : before.departmentId
    const reassigned = (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) || (input.departmentId !== undefined && input.departmentId !== before.departmentId)
    let nowAwaitingHead = false
    if (reassigned && before.status === "OPEN" && !before.declinedAt) {
      nowAwaitingHead = await assignmentNeedsHeadApproval({ departmentId: nextDepartmentId }, user)
      patch.awaitingHeadApproval = nowAwaitingHead
      patch.headReminderSentAt = null
      patch.headEscalatedAt = null
      patch.assignmentApprovedBy = null
      patch.assignmentApprovedAt = null
    }

    if (input.tatHours !== undefined && input.tatHours !== before.tatHours) {
      patch.tatHours = input.tatHours ?? null
      patch.tatDueAt = deriveTatDueAt(input.tatHours ?? null, new Date())
      patch.isOverdue = false
      patch.dueSoonNotifiedAt = null
      patch.overdueNotifiedAt = null
      patch.overdueEscalatedAt = null
    }

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      const effectiveTatDueAt = patch.tatDueAt !== undefined ? patch.tatDueAt : before.tatDueAt
      patch.isOverdue = overdueAtHandOver(patch.isOverdue ?? before.isOverdue, effectiveTatDueAt, new Date())
      patch.submittedAt = new Date()
      patch.approvalStage = "PC"
      patch.hodApprovedBy = null
      patch.hodApprovedAt = null
      patch.approvalReminderSentAt = null
      patch.approvalEscalatedAt = null
    } else if (input.status !== undefined && input.status !== "PENDING_APPROVAL" && before.status === "PENDING_APPROVAL") {
      patch.approvalStage = null
      patch.hodApprovedBy = null
      patch.hodApprovedAt = null
    }

    await db.transaction(async (tx) => {
      await tx.update(tickets).set(patch).where(eq(tickets.id, id))
      if (input.tagIds !== undefined) await syncTicketTags(tx, id, input.tagIds)
      if (input.reviewerIds !== undefined) await syncTicketReviewers(tx, id, input.reviewerIds)
    })

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    const afterTagIds = await ticketTagIds(id);
    const afterReviewerIds = await ticketReviewerIds(id);

    const addedReviewers = afterReviewerIds.filter((r) => !beforeReviewerIds.includes(r))
    if (addedReviewers.length) await notifySafely(() => notificationService.notifyReviewerAdded({ _id: id, title: afterRow!.title }, "TICKET", addedReviewers, user.sub))
    if (input.status && input.status !== before.status && (input.status === "OPEN" || input.status === "IN_PROGRESS")) {
      await notifySafely(() => notificationService.notifyStatusMoved({ _id: id, title: afterRow!.title, raiserId: afterRow!.userId }, "TICKET", input.status === "OPEN" ? "open again" : "in progress", user.sub))
    }

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "UPDATE",
      actorId: user.sub,
      before: { ...before, tagIds: beforeTagIds, reviewerIds: beforeReviewerIds },
      after: { ...afterRow, tagIds: afterTagIds, reviewerIds: afterReviewerIds },
    });

    const populated = await getPopulatedTicket(id)
    const target = roomTarget(afterRow!)

    emitTicketEvent("ticket:updated", target, populated);

    if (input.assigneeId && input.assigneeId !== before.assigneeId) {
      await db.update(tickets).set({ unassignedNotifiedAt: null }).where(eq(tickets.id, id))
      emitTicketEvent("ticket:assigned", target, populated)
      if (nowAwaitingHead) await notifySafely(() => notificationService.notifyTicketAwaitingHead(notificationTarget(afterRow!)))
      else await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)));
    }

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      await notifySafely(async () => notificationService.notifyPendingVerification({ ...notificationTarget(afterRow!), reviewerIds: await ticketReviewerIds(id) }, "TICKET", afterRow!.approvalStage ?? "PC"));
    }

    await dropTicketSummaries()
    return populated;
  },

  async addStatusUpdate(id: string, input: StatusUpdateInput, files: Express.Multer.File[], user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    assertCanMutate(user, ticket)

    if ((user.role === "AGENT" || user.role === "USER") && ticket.assigneeId !== user.sub) {
      throw AppError.forbidden("Only the person working on this ticket can change its status.")
    }

    const before = ticket;

    if (before.declinedAt) {
      throw AppError.badRequest("This ticket was declined. Use Reopen ticket to bring it back.")
    }

    const canActBeforeApproval = isVerifierRole(user) || isDepartmentHead(user, ticket)
    if (before.awaitingHeadApproval && !canActBeforeApproval) {
      throw AppError.forbidden("Your department head has to approve this ticket before work can start.")
    }

    if (files.length && settingsService.getCached().liveOnlyAttachments && input.captureMethod !== "LIVE") {
      throw AppError.badRequest("Photos must be taken with the camera. Pick Camera, not Gallery.")
    }

    const isProgressNote = input.status === "IN_PROGRESS" && before.status === "IN_PROGRESS"
    if (input.status === before.status && !isProgressNote) {
      throw AppError.conflict("This ticket is already in that status.")
    }
    if (isProgressNote && !input.remark) {
      throw AppError.badRequest("Write a short update so the team can see where this stands.")
    }
    if (before.status === "CLOSED" && !isVerifierRole(user)) {
      throw AppError.forbidden("Only an admin or PC can reopen a closed ticket.")
    }
    if (before.status === "PENDING_APPROVAL" && !isVerifierRole(user)) {
      throw AppError.forbidden("This ticket is waiting for approval. The reviewer can send it back if it needs more work.")
    }

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      const checklistsWithItems = await getTicketChecklistsWithItems(id)
      assertChecklistsResolved(checklistsWithItems, "sending this ticket for review")
    }

    const patch: Partial<typeof tickets.$inferInsert> = { status: input.status, updatedAt: new Date() }
    if (before.awaitingHeadApproval) {
      patch.awaitingHeadApproval = false
      patch.assignmentApprovedBy = user.sub
      patch.assignmentApprovedAt = new Date()
    }
    if ((before.status === "CLOSED" || before.status === "PENDING_APPROVAL") && input.status !== "PENDING_APPROVAL") {
      patch.reopenCount = before.reopenCount + 1
    }
    if (before.status === "CLOSED") {
      patch.closedAt = null;
      patch.verifiedBy = null;
      patch.verifiedAt = null;
      patch.verificationNote = null;
    }
    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      patch.isOverdue = overdueAtHandOver(before.isOverdue, before.tatDueAt, new Date())
      patch.submittedAt = new Date()
      patch.approvalStage = "PC"
      patch.hodApprovedBy = null
      patch.hodApprovedAt = null
      patch.approvalReminderSentAt = null
      patch.approvalEscalatedAt = null
    } else if (input.status !== "PENDING_APPROVAL" && before.status === "PENDING_APPROVAL") {
      patch.approvalStage = null
      patch.hodApprovedBy = null
      patch.hodApprovedAt = null
    }

    const statusUpdateId = createId()
    await db.transaction(async (tx) => {
      const [moved] = await tx.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.status, before.status), NOT_DELETED))
      if (moved.affectedRows === 0) throw AppError.conflict("Someone changed this ticket a moment ago. Open it again and retry.")

      await tx.insert(ticketStatusUpdates).values({
        id: statusUpdateId,
        ticketId: id,
        changedBy: user.sub,
        fromStatus: before.status,
        toStatus: input.status,
        remark: input.remark ?? "",
      })

      if (files.length) {
        await tx.insert(ticketAttachments).values(
          files.map((file) => ({
            id: createId(),
            url: `/uploads/ticket-attachments/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            captureMethod: input.captureMethod ?? "GALLERY",
            statusUpdateId,
            ticketId: id,
            uploadedBy: user.sub,
          })),
        )
      }
    })

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: isProgressNote ? "PROGRESS" : "UPDATE",
      actorId: user.sub,
      before,
      after: afterRow,
    });

    const populated = await getPopulatedTicket(id)
    const target = roomTarget(afterRow!)
    emitTicketEvent("ticket:updated", target, populated);

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      await notifySafely(async () => notificationService.notifyPendingVerification({ ...notificationTarget(afterRow!), reviewerIds: await ticketReviewerIds(id) }, "TICKET", afterRow!.approvalStage ?? "PC"));
    }

    if (input.status === "IN_PROGRESS" && before.status !== "IN_PROGRESS") {
      await notifySafely(() => notificationService.notifyStatusMoved({ _id: id, title: afterRow!.title, raiserId: afterRow!.userId }, "TICKET", "in progress", user.sub))
    }

    if (isProgressNote) {
      await notifySafely(() => notificationService.notifyTicketProgress(notificationTarget(afterRow!), input.remark ?? "", user.sub))
    }

    if (input.status === "ON_HOLD" && before.status !== "ON_HOLD") {
      await notifySafely(() => notificationService.notifyTicketOnHold(notificationTarget(afterRow!), input.remark ?? "", user.sub));
    }

    await dropTicketSummaries()
    return populated;
  },

  async approveAssignment(id: string, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    if (!canApproveAssignment(ticket, user)) throw AppError.forbidden("Only the department head, PC or an admin can approve this ticket.")
    if (!ticket.awaitingHeadApproval) throw AppError.conflict("This ticket has already been approved.")

    const now = new Date()
    const patch: Partial<typeof tickets.$inferInsert> = {
      awaitingHeadApproval: false,
      assignmentApprovedBy: user.sub,
      assignmentApprovedAt: now,
      updatedAt: now,
    }
    if (ticket.tatHours) {
      patch.tatDueAt = deriveTatDueAt(ticket.tatHours, now)
      patch.isOverdue = false
      patch.dueSoonNotifiedAt = null
      patch.overdueNotifiedAt = null
      patch.overdueEscalatedAt = null
    }
    const [result] = await db.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.awaitingHeadApproval, true), NOT_DELETED))
    if (result.affectedRows === 0) throw AppError.conflict("Someone approved this ticket a moment ago.")

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    await auditService.record({ entityType: "Ticket", entityId: id, action: "UPDATE", actorId: user.sub, before: ticket, after: afterRow })

    const populated = await getPopulatedTicket(id)
    emitTicketEvent("ticket:updated", roomTarget(afterRow!), populated)
    await notifySafely(() => notificationService.notifyTicketHeadApproved(notificationTarget(afterRow!), user.sub))
    await dropTicketSummaries()
    return populated
  },

  async reopenDeclined(id: string, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    if (!ticket.declinedAt) throw AppError.badRequest("This ticket was not declined.")
    if (!canApproveAssignment(ticket, user)) throw AppError.forbidden("Only the department head, PC or an admin can reopen a declined ticket.")

    const now = new Date()
    const [result] = await db.update(tickets).set({
      status: "OPEN",
      declinedAt: null,
      declinedBy: null,
      declineReason: null,
      closedAt: null,
      verifiedBy: null,
      verifiedAt: null,
      verificationNote: null,
      awaitingHeadApproval: false,
      assignmentApprovedBy: user.sub,
      assignmentApprovedAt: now,
      reopenCount: ticket.reopenCount + 1,
      tatDueAt: ticket.tatHours ? deriveTatDueAt(ticket.tatHours, now) : ticket.tatDueAt,
      isOverdue: false,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      overdueEscalatedAt: null,
      updatedAt: now,
    }).where(and(eq(tickets.id, id), isNotNull(tickets.declinedAt), NOT_DELETED))
    if (result.affectedRows === 0) throw AppError.conflict("Someone reopened this ticket a moment ago.")

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    await auditService.record({ entityType: "Ticket", entityId: id, action: "REOPEN", actorId: user.sub, before: ticket, after: afterRow })

    const populated = await getPopulatedTicket(id)
    emitTicketEvent("ticket:updated", roomTarget(afterRow!), populated)
    await notifySafely(() => notificationService.notifyTicketHeadApproved(notificationTarget(afterRow!), user.sub))
    await dropTicketSummaries()
    return populated
  },

  async decline(id: string, reason: string, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    const isHead = (user.role === "MANAGER" || user.role === "SENIOR") && !!user.departmentId && ticket.departmentId === user.departmentId
    if (!isVerifierRole(user) && !isHead) throw AppError.forbidden("Only the department head, PC or an admin can decline this ticket.")
    if (ticket.userId === user.sub && !isVerifierRole(user)) throw AppError.badRequest("You raised this ticket. Withdraw it instead of declining it.")
    if (!["OPEN", "IN_PROGRESS", "ON_HOLD"].includes(ticket.status)) {
      throw AppError.badRequest(ticket.status === "PENDING_APPROVAL" ? "This ticket is waiting for approval. Approve it or send it back instead." : "This ticket is already closed.")
    }

    const now = new Date()
    const note = reason.trim()
    const [result] = await db.update(tickets).set({
      status: "CLOSED",
      closedAt: now,
      declinedAt: now,
      declinedBy: user.sub,
      declineReason: note,
      isOverdue: false,
      updatedAt: now,
    }).where(and(eq(tickets.id, id), eq(tickets.status, ticket.status), NOT_DELETED))
    if (result.affectedRows === 0) throw AppError.conflict("Someone changed this ticket a moment ago. Open it again and retry.")

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    await auditService.record({ entityType: "Ticket", entityId: id, action: "DECLINE", actorId: user.sub, before: ticket, after: afterRow })

    const populated = await getPopulatedTicket(id)
    emitTicketEvent("ticket:updated", roomTarget(afterRow!), populated)
    await notifySafely(() => notificationService.notifyTicketDeclined({ _id: id, title: ticket.title, userId: ticket.userId, assigneeId: ticket.assigneeId }, note, user.sub))
    await dropTicketSummaries()
    return populated
  },

  async verify(id: string, input: VerifyTicketInput, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")

    if (ticket.status !== "PENDING_APPROVAL") {
      throw AppError.badRequest("This ticket isn't pending approval.")
    }

    await assertCanVerify(ticket, user)

    const before = ticket;
    const fromStatus = ticket.status
    const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date(), verificationNote: input.note ?? null }

    if (input.action === "APPROVE") {
      patch.status = "CLOSED";
      patch.closedAt = new Date();
      patch.verifiedBy = user.sub;
      patch.verifiedAt = new Date();
      patch.approvalStage = null
    } else {
      patch.status = "IN_PROGRESS";
      patch.reopenCount = ticket.reopenCount + 1;
      patch.approvalStage = null
      patch.hodApprovedBy = null
      patch.hodApprovedAt = null
    }
    await db.transaction(async (tx) => {
      const [result] = await tx.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.status, fromStatus), NOT_DELETED))
      if (result.affectedRows === 0) {
        throw AppError.badRequest("This ticket isn't pending approval.")
      }

      if (input.action === "REJECT") {
        await tx.insert(ticketStatusUpdates).values({
          id: createId(),
          ticketId: id,
          changedBy: user.sub,
          fromStatus: fromStatus,
          toStatus: "IN_PROGRESS",
          remark: input.note?.trim() ?? "",
        })
      }
    })

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "UPDATE",
      actorId: user.sub,
      before,
      after: afterRow,
    })

    const populated = await getPopulatedTicket(id)
    emitTicketEvent("ticket:updated", roomTarget(afterRow!), populated);
    await notifySafely(() => notificationService.notifyVerificationResult(notificationTarget(afterRow!), input.action, input.note, "TICKET", []))
    await dropTicketSummaries()
    return populated;
  },

  async remove(id: string, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")

    const withdrawn = !isVerifierRole(user)
    if (withdrawn) {
      if (ticket.userId !== user.sub) {
        throw AppError.forbidden("Only the person who raised this ticket can withdraw it.")
      }
      const [started] = await db.select({ id: ticketStatusUpdates.id })
        .from(ticketStatusUpdates)
        .where(eq(ticketStatusUpdates.ticketId, id))
        .limit(1)
      if (ticket.status !== "OPEN" || started) {
        throw AppError.badRequest("Work on this ticket has already started, so it can't be withdrawn. Ask an admin if it needs to go.")
      }
    }

    const deletedAt = new Date()
    await db.update(tickets).set({ deletedAt, updatedAt: deletedAt }).where(eq(tickets.id, id))

    emitTicketEvent("ticket:deleted", roomTarget(ticket), { id: ticket.id })

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "DELETE",
      actorId: user.sub,
      before: ticket,
      after: withdrawn ? { withdrawnByRaiser: true } : undefined,
    })
    await dropTicketSummaries()
    return ticket;
  },

  async tatReport(groupBy: ReportGroupBy, from?: string, to?: string, departmentId?: string, storeId?: string) {
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
  },

  async ownerStats(scope: "department" | "store" | "user" | "org", from?: string, to?: string, departmentId?: string, storeId?: string): Promise<OwnerStatsRow[]> {
    const scopeConditions: SQL[] = []
    if (departmentId) scopeConditions.push(sql`tickets.departmentId = ${departmentId}`)
    if (storeId) scopeConditions.push(sql`tickets.storeId = ${storeId}`)
    const window = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }

    if (scope === "department") return ownerStatsByColumn(sql`tickets.departmentId`, scopeConditions, window, true)
    if (scope === "store") return ownerStatsByColumn(sql`tickets.storeId`, scopeConditions, window, true)
    if (scope === "org") return ownerStatsByColumn(sql`NULL`, scopeConditions, window, false)
    return ownerStatsByColumn(sql`tickets.assigneeId`, [...scopeConditions, sql`tickets.assigneeId IS NOT NULL`], window, true)
  },

  async summary(user: AccessTokenPayload, scope: TicketSummaryScope = "mine"): Promise<TicketSummaryRow> {
    const version = await versionTag(TICKET_SUMMARY_VERSION)
    return cached(cacheKey(TICKET_SUMMARY_PREFIX, `v${version}`, scope, user.sub), SUMMARY_TTL_SECONDS, async () => {
      const scopeCondition = scope === "visible"
        ? await visibilityFilter(user)
        : or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))
      const where = and(NOT_DELETED, scopeCondition)

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
  },

  async pendingApproval(user: AccessTokenPayload, limit = 8): Promise<{ data: TicketPendingApprovalRow[]; meta: { total: number } }> {
    const POOL = 40
    const stageScope = user.role === "ADMIN" || user.role === "PC" ? undefined : sql`1 = 0`
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
  },
}
