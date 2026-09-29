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
import { eq, and, or, inArray, desc, asc, sql, isNull } from "drizzle-orm"
import { cached, cacheKey } from "../../config/queryCache.js"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTicketInput, UpdateTicketInput, VerifyTicketInput, StatusUpdateInput } from "./ticket.validation.js"
import { auditService } from "../audit/audit.service.js"
import { emitTicketEvent } from "../../sockets/ticketEvent.js"
import { DATE_FORMATS } from "../../utils/dateBucket.js"
import type { DateBucket } from "../../utils/index.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { settingsService } from "../settings/settings.service.js"

type TicketRow = typeof tickets.$inferSelect

// Soft-delete: remove() sets `deletedAt` instead of removing the row (and used to also
// hard-delete every child Checklist/ChecklistItem/ChecklistImage/TicketAttachment/TicketComment/
// TicketStatusUpdate row and unlink their uploaded files from disk). Nothing else is touched —
// children stay exactly as they were, so a deleted ticket's history is fully recoverable, not
// just its own row. Same convention as Task (see task.service.ts's own NOT_DELETED) — every read
// path below (list/getById/update/addStatusUpdate/verify/reports) must AND this in.
const NOT_DELETED = isNull(tickets.deletedAt)

// Recomputes tatDueAt from tatHours (was a Mongoose pre('save') hook on Ticket — see
// src/models/Ticket.ts). Call this explicitly everywhere tatHours is set/changed, alongside
// resetting isOverdue back to false.
const deriveTatDueAt = (tatHours: number | null, fromDate: Date): Date | null =>
  tatHours ? new Date(fromDate.getTime() + tatHours * 60 * 60 * 1000) : null

// NOTE on populate-heavy reads: the conventions doc recommends Drizzle's relational query API
// (`db.query.tickets.findFirst({ with: {...} })`) for these, but that API compiles every
// relation (even a single "one" relation) into a `LEFT JOIN LATERAL (...)` subquery — and the
// actual database this app runs against (MariaDB 10.11) does not support the LATERAL join
// syntax at all (confirmed against the real local instance; even a single-level `with` fails
// with a SQL syntax error). So every populate below is done as plain `db.select()` calls
// (regular, non-lateral joins/`inArray` batch queries) with the nesting assembled by hand in JS
// instead — same pattern as task.service.ts/event.service.ts.

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

// Labels for a set of tickets, as one query instead of one per ticket — mirrors
// task.service.ts's tagsByTask exactly, just against ticketTags/ticketId.
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

// Replaces a ticket's labels with exactly `tagIds`. Delete-then-insert rather than diffing: the
// set is at most 12 rows (capped in validation), so a diff would be more code for no saved work.
// Takes plain `db`, not a transaction — ticket.service.ts has no transactions anywhere else
// (create/update are sequential insert-then-select-back already), so this matches that existing
// non-atomicity rather than introducing a new pattern just for tags.
//
// `undefined` means "not mentioned in this request" and is handled by the callers, which skip
// calling this entirely. An empty array means "remove them all", which is a real instruction.
const syncTicketTags = async (executor: typeof db, ticketId: string, tagIds: string[]) => {
  await executor.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId))
  if (!tagIds.length) return

  // Deduped because the unique index on (ticketId, tagId) would otherwise reject the whole
  // insert if a caller sent the same id twice.
  const unique = [...new Set(tagIds)]
  // Only ids that actually exist — a stale id from a client whose tag list predates a deletion
  // would otherwise fail the foreign key and take the entire ticket update down with it.
  const existing = await executor.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique))
  if (!existing.length) return

  await executor.insert(ticketTags).values(existing.map((tag) => ({ ticketId, tagId: tag.id })))
}

// Current tag/reviewer ids for one ticket, sorted for stable before/after comparison — tags and
// reviewers live in their own junction tables, not columns on `tickets` itself, so a plain
// before/after snapshot of the `tickets` row (see update() below) never reflected a tags-only or
// reviewers-only change: the audit UPDATE fired with the row's own columns unchanged, and
// diffAuditLog (client) correctly reported "0 fields changed" for something that, from the
// audit trail's perspective, genuinely hadn't changed at all. These two folded into update()'s
// before/after objects are what actually closes that gap.
const ticketTagIds = async (ticketId: string): Promise<string[]> =>
  (await db.select({ tagId: ticketTags.tagId }).from(ticketTags).where(eq(ticketTags.ticketId, ticketId)))
    .map((r) => r.tagId).sort()

const ticketReviewerIds = async (ticketId: string): Promise<string[]> =>
  (await db.select({ userId: ticketReviewers.userId }).from(ticketReviewers).where(eq(ticketReviewers.ticketId, ticketId)))
    .map((r) => r.userId).sort()

// Ticket ids where `userId` was explicitly named a reviewer — mirrors task.service.ts's
// reviewerTaskIds. Used both to widen visibilityFilter (a reviewer needs to be able to find the
// ticket before they can verify it) and by assertCanVerify below.
const reviewerTicketIds = async (userId: string): Promise<string[]> => {
  const rows = await db.select({ ticketId: ticketReviewers.ticketId }).from(ticketReviewers).where(eq(ticketReviewers.userId, userId))
  return rows.map((r) => r.ticketId)
}

// Replaces a ticket's reviewer list with exactly `userIds` — same delete-then-insert convention
// as syncTicketTags.
const syncTicketReviewers = async (executor: typeof db, ticketId: string, userIds: string[]) => {
  await executor.delete(ticketReviewers).where(eq(ticketReviewers.ticketId, ticketId))
  if (!userIds.length) return
  const unique = [...new Set(userIds)]
  await executor.insert(ticketReviewers).values(unique.map((userId) => ({ ticketId, userId })))
}

// Reviewer rows for a set of tickets, as one query — mirrors tagsByTicket, used by
// populateTickets to hand the client back who's named on a ticket, not just how many.
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

// Batch-populates a set of already-fetched Ticket rows with everything the old
// `populateTicket` Mongoose populate chain used to attach: assignee/raisedBy/verifier,
// checklists -> items -> images, attachments -> uploadedByUser, comments -> author (sorted
// ascending), statusUpdates -> changedByUser + photos (sorted descending).
const populateTickets = async (ticketRows: TicketRow[]) => {
  if (!ticketRows.length) return []
  const ticketIds = ticketRows.map((t) => t.id)

  const userIds = [...new Set(ticketRows.flatMap((t) => [t.assigneeId, t.userId, t.verifiedBy]).filter((v): v is string => Boolean(v)))]
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

// checklists -> items only, used by the PENDING_APPROVAL checklist-completeness gate (no
// images/photos needed there — see assertChecklistsResolved).
const getTicketChecklistsWithItems = async (ticketId: string) => {
  const checklistRows = await db.select().from(checklists).where(eq(checklists.ticketId, ticketId))
  const checklistIds = checklistRows.map((c) => c.id)
  const itemRows = checklistIds.length ? await db.select().from(checklistItems).where(inArray(checklistItems.checklistId, checklistIds)) : []
  const itemsByChecklist = groupBy(itemRows, (i) => i.checklistId)
  return checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }))
}

const visibilityFilter = async (user: AccessTokenPayload) => {
  // PC has the same org-wide access as ADMIN — same as tasks (see task.service.ts's own
  // visiblityFilter), so a PC user isn't blocked from other departments' tickets.
  // APPROVAL_MANAGER has the same org-wide reach as ADMIN/PC — the final-approval stage needs to
  // see every PENDING_APPROVAL ticket across the org, not just one department/store.
  if (user.role === "ADMIN" || user.role === "PC" || user.role === "APPROVAL_MANAGER") return undefined

  let base: ReturnType<typeof or>

  if (user.role === "MANAGER") {
    const or_conditions = [eq(tickets.userId, user.sub)]
    if (user.departmentId) or_conditions.push(eq(tickets.departmentId, user.departmentId))
    if (user.storeId) or_conditions.push(eq(tickets.storeId, user.storeId))
    base = or(...or_conditions)
  } else if (user.role === "SENIOR") {
    // SENIOR is store-only (no department fallback) — an Area Head oversees exactly one store.
    base = user.storeId ? eq(tickets.storeId, user.storeId) : eq(tickets.userId, user.sub)
  } else if (user.role === "AGENT" || user.role === "USER") {
    // A ticket assigned to/raised by this user is always visible to them, regardless of
    // department — a MANAGER/ADMIN can route a ticket to someone outside its department, and
    // ANDing department here would make that assignee's own ticket invisible to them.
    // task.service.ts's equivalent visibility check has no department restriction on "it's mine"
    // either.
    base = or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))!
  } else {
    base = eq(tickets.userId, user.sub)
  }

  // An explicitly named reviewer (ticketReviewers, additive on top of the role-based rule — see
  // assertCanVerify) needs to be able to find the ticket at all before they can verify it,
  // regardless of role/department/store — same reach Task's reviewer scoping already grants.
  const reviewedIds = await reviewerTicketIds(user.sub)
  return reviewedIds.length ? or(base!, inArray(tickets.id, reviewedIds)) : base
}

// verify()'s authorization — deliberately separate from (and narrower than) visibilityFilter,
// which a ticket's own raiser/assignee already satisfies. They must not be able to self-approve
// their own ticket, so role-based verify rights are their own table (mirrors
// task.service.ts's CAN_VERIFY_BY_ROLE/assertCanVerify and checklistInstance.service.ts's).
const CAN_VERIFY_BY_ROLE: Partial<Record<AccessTokenPayload["role"], (ticket: { departmentId: string | null }, user: AccessTokenPayload) => boolean>> = {
  ADMIN: () => true,
  PC: () => true,
  // MANAGER (HOD) may verify a ticket within their own department only — deliberately narrower
  // than visibilityFilter's MANAGER branch (which also grants store-wide visibility), so "can see
  // it" and "can approve it" stay separate. Additive on top of whatever else could already verify
  // it, never a replacement.
  MANAGER: (ticket, user) => !!user.departmentId && ticket.departmentId === user.departmentId,
}

// An explicitly named reviewer (ticketReviewers) can always verify, on top of whatever
// CAN_VERIFY_BY_ROLE already grants — additive, never a replacement. This is also why
// PATCH /tickets/:id/verify no longer role-gates at the router: a reviewer can be any role at
// all, so the check has to happen here, against this specific ticket.
const assertCanVerify = async (ticket: { id: string; departmentId: string | null }, user: AccessTokenPayload) => {
  if (CAN_VERIFY_BY_ROLE[user.role]?.(ticket, user)) return
  const [reviewer] = await db.select({ id: ticketReviewers.id })
    .from(ticketReviewers)
    .where(and(eq(ticketReviewers.ticketId, ticket.id), eq(ticketReviewers.userId, user.sub)))
    .limit(1)
  if (!reviewer) throw AppError.forbidden()
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

// Shim passed to notificationService (still Mongoose-backed, migrated in a later pass) — its
// param types are `any`-typed fields, so a plain object using our string cuids works fine.
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
}

// Same shape task.service.ts's own PendingApprovalRow uses — the dashboard's "Needs your
// approval" card combines both alongside checklistInstance's differently-shaped row client-side.
export type TicketPendingApprovalRow = {
  id: string
  title: string
  submittedBy: string | null
  waitingSince: string
}

// Same shape task.service.ts's TaskSummaryRow uses (minus `draft` — tickets have no draft
// status), so the sidebar's per-entity badge can treat every summary response uniformly.
export type TicketSummaryRow = {
  total: number
  newToday: number
  due: number
  overdue: number
  completed: number
}

// One grouped SQL aggregate behind ownerStats below — `column` is what to GROUP BY (a department/
// store/assignee/user id column, or NULL for one ungrouped org-wide row when `grouped` is false).
const ownerStatsByColumn = async (
  column: ReturnType<typeof sql>,
  conditions: ReturnType<typeof sql>[],
  grouped: boolean,
): Promise<OwnerStatsRow[]> => {
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``
  const groupBy = grouped ? sql`GROUP BY ownerId` : sql``

  // db.execute() on the mysql2 driver resolves to the raw mysql2 tuple [rows, fields],
  // NOT a plain row array — must destructure element 0 (see task.service.ts#complianceReport).
  const [rows] = await db.execute(sql`
    SELECT
      ${column} AS ownerId,
      COUNT(*) AS total,
      SUM(tickets.status = 'CLOSED') AS closed,
      SUM(tickets.isOverdue) AS overdueCount,
      AVG(CASE WHEN tickets.closedAt IS NOT NULL THEN TIMESTAMPDIFF(SECOND, tickets.createdAt, tickets.closedAt) / 3600 END) AS avgTatHours
    FROM Ticket tickets
    ${where}
    ${groupBy}
  `)

  return (rows as unknown as any[]).map((r) => ({
    ownerId: r.ownerId != null ? String(r.ownerId) : null,
    total: Number(r.total),
    closed: Number(r.closed),
    overdueCount: Number(r.overdueCount),
    avgTatHours: r.avgTatHours != null ? Math.round(Number(r.avgTatHours) * 10) / 10 : null,
  }))
}

export const ticketService = {
  async list(user: AccessTokenPayload, page: number, limit: number, status?: string, assigneeId?: string, overdue?: boolean, from?: string, to?: string, dateField: "createdAt" | "closedAt" = "createdAt") {
    const conditions = [NOT_DELETED]
    const vis = await visibilityFilter(user)
    if (vis) conditions.push(vis)
    if (status) conditions.push(eq(tickets.status, status as TicketRow["status"]))
    if (assigneeId && (user.role === "ADMIN" || user.role === "PC")) {
      conditions.push(or(eq(tickets.userId, assigneeId), eq(tickets.assigneeId, assigneeId))!)
    }
    if (overdue !== undefined) conditions.push(eq(tickets.isOverdue, overdue))
    const dateColumn = dateField === "closedAt" ? tickets.closedAt : tickets.createdAt
    if (from) conditions.push(sql`${dateColumn} >= ${new Date(from)}`)
    if (to) conditions.push(sql`${dateColumn} <= ${new Date(to)}`)
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

  async create(input: CreateTicketInput, user: AccessTokenPayload) {
    const tatHours = input.tatHours ?? settingsService.getCached().defaultTatHours
    const id = createId()
    const now = new Date()
    await db.insert(tickets).values({
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
      isOverdue: false,
      userId: user.sub,
    })

    if (input.tagIds?.length) await syncTicketTags(db, id, input.tagIds)
    if (input.reviewerIds?.length) await syncTicketReviewers(db, id, input.reviewerIds)

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

    if (afterRow!.assigneeId) {
      await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)))
    }

    return populated;
  },

  async update(id: string, input: UpdateTicketInput, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    assertCanMutate(user, ticket)

    // Reassigning who owns/handles a ticket is a routing decision, not ordinary field-editing —
    // even a caller who can mutate this ticket at all (e.g. an AGENT/USER who merely raised or
    // was assigned it) shouldn't be able to redirect it to an arbitrary assignee or department
    // on their own; only someone with actual authority over routing should.
    if ((input.assigneeId !== undefined || input.departmentId !== undefined) && (user.role === "AGENT" || user.role === "USER")) {
      throw AppError.forbidden("Only a manager or above can reassign a ticket's assignee or department.")
    }

    const before = ticket;
    const beforeTagIds = await ticketTagIds(id);
    const beforeReviewerIds = await ticketReviewerIds(id);

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

    if (input.status === "CLOSED" && before.status !== "CLOSED") {
      // This used to just role-gate (ADMIN/PC) and set closedAt — which let a verifier close a
      // ticket straight from OPEN/IN_PROGRESS/ON_HOLD, skipping both the checklist gate that
      // normally has to clear on the way into PENDING_APPROVAL (see the branch below) and the
      // verification record itself (verifiedBy/verifiedAt/verificationNote all stayed null, so
      // VerificationNoteBanner had nothing to show for a "closed" ticket). Closing is a
      // verification decision, not a plain status change — verify() (PATCH /tickets/:id/verify,
      // action=APPROVE) is the one place that sets all three atomically under the same
      // optimistic-concurrency guard, and is now the only way to reach CLOSED going forward.
      throw AppError.badRequest("A ticket can only be closed by approving it — send it for review first, then approve it from there.")
    } else if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      // Fresh read with the exact `with` needed for the checklist gate, replacing the old
      // mid-flight `ticket.populate(...)` call on the already-fetched Mongoose document.
      const checklistsWithItems = await getTicketChecklistsWithItems(id)
      assertChecklistsResolved(checklistsWithItems, "sending this ticket for review")
    } else if (input.status && input.status !== "CLOSED" && before.status === "CLOSED") {
      // Symmetric with the CLOSE guard above: only a verifier can reopen an already-closed
      // ticket too — otherwise the raiser/assignee (who already has ordinary mutate rights via
      // assertCanMutate) could reopen it themselves, silently discarding PC's decision.
      if (user.role !== "ADMIN" && user.role !== "PC") {
        throw AppError.forbidden("Only a verifier can reopen a ticket that's already been closed.")
      }
      patch.closedAt = null;
      // The old verification is no longer valid for whatever state the ticket moves back into —
      // clear it so the record doesn't keep showing a verifiedBy/verifiedAt/verificationNote for
      // a decision that no longer describes the ticket's current state.
      patch.verifiedBy = null;
      patch.verifiedAt = null;
      patch.verificationNote = null;
    }

    if (input.tatHours !== undefined && input.tatHours !== before.tatHours) {
      patch.tatHours = input.tatHours ?? null
      patch.tatDueAt = deriveTatDueAt(input.tatHours ?? null, new Date())
      patch.isOverdue = false
    }

    await db.update(tickets).set(patch).where(eq(tickets.id, id))

    // Not a column on `tickets`, so this sits beside the patch rather than inside it.
    if (input.tagIds !== undefined) await syncTicketTags(db, id, input.tagIds)
    if (input.reviewerIds !== undefined) await syncTicketReviewers(db, id, input.reviewerIds)

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    const afterTagIds = await ticketTagIds(id);
    const afterReviewerIds = await ticketReviewerIds(id);

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
      emitTicketEvent("ticket:assigned", target, populated)
      await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)));
    }

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      await notifySafely(() => notificationService.notifyPendingVerification(notificationTarget(afterRow!)));
    }

    return populated;
  },

  async addStatusUpdate(id: string, input: StatusUpdateInput, files: Express.Multer.File[], user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    assertCanMutate(user, ticket)

    const before = ticket;

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      const checklistsWithItems = await getTicketChecklistsWithItems(id)
      assertChecklistsResolved(checklistsWithItems, "sending this ticket for review")
    }

    const patch: Partial<typeof tickets.$inferInsert> = { status: input.status, updatedAt: new Date() }
    if (before.status === "CLOSED") {
      patch.closedAt = null;
    }

    const statusUpdateId = createId()
    await db.insert(ticketStatusUpdates).values({
      id: statusUpdateId,
      ticketId: id,
      changedBy: user.sub,
      fromStatus: before.status,
      toStatus: input.status,
      remark: input.remark,
    })

    if (files.length) {
      await db.insert(ticketAttachments).values(
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

    await db.update(tickets).set(patch).where(eq(tickets.id, id))

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "UPDATE",
      actorId: user.sub,
      before,
      after: afterRow,
    });

    const populated = await getPopulatedTicket(id)
    const target = roomTarget(afterRow!)
    emitTicketEvent("ticket:updated", target, populated);

    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      await notifySafely(() => notificationService.notifyPendingVerification(notificationTarget(afterRow!)));
    }

    if (input.status === "ON_HOLD" && before.status !== "ON_HOLD") {
      await notifySafely(() => notificationService.notifyTicketOnHold(notificationTarget(afterRow!), input.remark, user.sub));
    }

    return populated;
  },


  async verify(id: string, input: VerifyTicketInput, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")

    if (ticket.status !== "PENDING_APPROVAL") {
      throw AppError.badRequest("This ticket isn't pending approval.")
    }

    // Single-stage verify: one PC/ADMIN/manager/reviewer check decides the whole thing (the old
    // two-stage QC-then-approval split — a separate APPROVAL_MANAGER-only sign-off after QC passed
    // — is gone; approving here is final).
    await assertCanVerify(ticket, user)

    const before = ticket;
    const fromStatus = ticket.status
    const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date(), verificationNote: input.note ?? null }

    if (input.action === "APPROVE") {
      patch.status = "CLOSED";
      patch.closedAt = new Date();
      patch.verifiedBy = user.sub;
      patch.verifiedAt = new Date();
    } else {
      patch.status = "IN_PROGRESS";
    }
    // Optimistic-concurrency guard: the WHERE clause re-checks the status this row was read at
    // atomically inside the UPDATE itself, so two concurrent verify calls can't both "win" — only
    // the first write matches and the second gets affectedRows === 0 instead of racing to a bad
    // final state.
    const [result] = await db.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.status, fromStatus), NOT_DELETED))
    if (result.affectedRows === 0) {
      throw AppError.badRequest("This ticket isn't pending approval.")
    }

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
    await notifySafely(() => notificationService.notifyVerificationResult(notificationTarget(afterRow!), input.action, input.note))
    return populated;
  },

  // Soft delete: sets deletedAt instead of removing the row (and used to also hard-delete every
  // child Checklist/ChecklistItem/ChecklistImage/TicketAttachment/TicketComment/TicketStatusUpdate
  // row in a transaction, plus unlink their uploaded files from disk — see git history for that
  // cascade if it's ever needed again). Nothing else is touched: children stay exactly as they
  // were so the ticket is fully recoverable, not just its own row. Every read path in this file
  // (list/getById/update/addStatusUpdate/verify/reports) hides it from here on via NOT_DELETED.
  async remove(id: string, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")

    const deletedAt = new Date()
    await db.update(tickets).set({ deletedAt, updatedAt: deletedAt }).where(eq(tickets.id, id))

    emitTicketEvent("ticket:deleted", roomTarget(ticket), { id: ticket.id })

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "DELETE",
      actorId: user.sub,
      before: ticket,
    })
    return ticket;
  },

  // Original Mongo version used a single $facet aggregation (closed-tickets branch +
  // created-tickets branch computed in one round-trip). Ported here as two plain
  // queries merged in JS — MySQL has no $facet equivalent, and two queries against
  // indexed columns is simpler and just as fast as emulating it in one statement.
  async tatReport(groupBy: DateBucket, from?: string, to?: string, departmentId?: string, storeId?: string) {
    const closedConditions: ReturnType<typeof sql>[] = [sql`tickets.closedAt IS NOT NULL`, sql`tickets.deletedAt IS NULL`];
    if (from) closedConditions.push(sql`tickets.closedAt >= ${new Date(from)}`);
    if (to) closedConditions.push(sql`tickets.closedAt <= ${new Date(to)}`);
    if (departmentId) closedConditions.push(sql`tickets.departmentId = ${departmentId}`);
    if (storeId) closedConditions.push(sql`tickets.storeId = ${storeId}`);

    const createdConditions: ReturnType<typeof sql>[] = [sql`tickets.deletedAt IS NULL`];
    if (from) createdConditions.push(sql`tickets.createdAt >= ${new Date(from)}`);
    if (to) createdConditions.push(sql`tickets.createdAt <= ${new Date(to)}`);
    if (departmentId) createdConditions.push(sql`tickets.departmentId = ${departmentId}`);
    if (storeId) createdConditions.push(sql`tickets.storeId = ${storeId}`);

    const closedWhere = sql`WHERE ${sql.join(closedConditions, sql` AND `)}`;
    const createdWhere = createdConditions.length ? sql`WHERE ${sql.join(createdConditions, sql` AND `)}` : sql``;

    // db.execute() on the mysql2 driver resolves to the raw mysql2 tuple [rows, fields],
    // NOT a plain row array — must destructure element 0 (see task.service.ts#complianceReport).
    const [closedRows] = await db.execute(sql`
      SELECT
        DATE_FORMAT(tickets.closedAt, ${DATE_FORMATS[groupBy]}) AS bucket,
        COUNT(*) AS closedCount,
        AVG(TIMESTAMPDIFF(SECOND, tickets.createdAt, tickets.closedAt) / 3600) AS avgTatHours,
        SUM(tickets.isOverdue) AS overdueCount
      FROM Ticket tickets
      ${closedWhere}
      GROUP BY bucket
    `);

    const [createdRows] = await db.execute(sql`
      SELECT
        DATE_FORMAT(tickets.createdAt, ${DATE_FORMATS[groupBy]}) AS bucket,
        COUNT(*) AS createdCount
      FROM Ticket tickets
      ${createdWhere}
      GROUP BY bucket
    `);

    const closedByBucket = new Map<string, { closedCount: number; avgTatHours: number | null; overdueCount: number }>(
      (closedRows as unknown as any[]).map((r) => [r.bucket as string, {
        closedCount: Number(r.closedCount),
        avgTatHours: r.avgTatHours != null ? Number(r.avgTatHours) : null,
        overdueCount: Number(r.overdueCount),
      }])
    );
    const createdByBucket = new Map<string, number>(
      (createdRows as unknown as any[]).map((r) => [r.bucket as string, Number(r.createdCount)])
    );

    const buckets = [...new Set([...closedByBucket.keys(), ...createdByBucket.keys()])].sort();

    return buckets.map((bucket) => {
      const closed = closedByBucket.get(bucket);
      const createdCount = createdByBucket.get(bucket) ?? 0;
      const closedCount = closed?.closedCount ?? 0;
      return {
        bucket,
        createdCount,
        closedCount,
        avgTatHours: closed?.avgTatHours != null ? Math.round(closed.avgTatHours * 10) / 10 : null,
        overdueCount: closed?.overdueCount ?? 0,
        completionRate: createdCount ? Math.round((closedCount / createdCount) * 1000) / 10 : null,
      };
    });
  },

  /**
   * The "who's doing well" numbers behind the department/store ranking tables
   * (StoresPerformanceSection/PerformanceLeadersCard), the team leaderboard, and the org-wide
   * on-time/overdue stat cards on OrgOverview — these used to be derived client-side by reducing
   * over a single newest-100-tickets page, which silently mis-scored (or zeroed out) anyone whose
   * tickets weren't among the org's 100 most recently created. Real GROUP BY aggregates instead,
   * scoped by createdAt (matching the date-range control these screens already share), so the
   * numbers are correct at any ticket count and every screen that shows "on-time %" agrees on what
   * that means: not-yet-overdue as a share of every ticket in scope (open or closed), not two
   * different definitions on two different cards.
   */
  async ownerStats(scope: "department" | "store" | "user" | "org", from?: string, to?: string, departmentId?: string, storeId?: string): Promise<OwnerStatsRow[]> {
    const baseConditions: ReturnType<typeof sql>[] = [sql`tickets.deletedAt IS NULL`]
    if (from) baseConditions.push(sql`tickets.createdAt >= ${new Date(from)}`)
    if (to) baseConditions.push(sql`tickets.createdAt <= ${new Date(to)}`)
    if (departmentId) baseConditions.push(sql`tickets.departmentId = ${departmentId}`)
    if (storeId) baseConditions.push(sql`tickets.storeId = ${storeId}`)

    if (scope === "department") return ownerStatsByColumn(sql`tickets.departmentId`, baseConditions, true)
    if (scope === "store") return ownerStatsByColumn(sql`tickets.storeId`, baseConditions, true)
    if (scope === "org") return ownerStatsByColumn(sql`NULL`, baseConditions, false)

    // "user": a ticket counts toward BOTH its assignee and its raiser — the same dual-credit rule
    // the old client-side reduce used (`t.assigneeId === u.id || t.userId === u.id`) — which one
    // GROUP BY can't express (a row belongs to exactly one group). Two grouped queries instead,
    // merged by user id below. A third query isolates self-assigned tickets (assigneeId ===
    // userId) — present in BOTH grouped result sets, so it's subtracted back out once rather than
    // left double-credited (an earlier version of this method accepted that as a known gap; fixed
    // since a leaderboard/ranking score is exactly the kind of number self-assigning work
    // shouldn't be able to inflate).
    const [byAssignee, byRaiser, bySelfAssigned] = await Promise.all([
      ownerStatsByColumn(sql`tickets.assigneeId`, [...baseConditions, sql`tickets.assigneeId IS NOT NULL`], true),
      ownerStatsByColumn(sql`tickets.userId`, baseConditions, true),
      ownerStatsByColumn(sql`tickets.assigneeId`, [...baseConditions, sql`tickets.assigneeId = tickets.userId`], true),
    ])
    // Accumulate raw sums (not averages) so the self-assigned subtraction can net out cleanly —
    // averaging avgTatHours values directly (the old approach) would have been wrong even before
    // this fix, since it weights every source row's *own* average equally regardless of how many
    // closed tickets it actually represents.
    const merged = new Map<string, { total: number; closed: number; overdueCount: number; tatHoursSum: number }>()
    const accumulate = (rows: OwnerStatsRow[], sign: 1 | -1) => {
      for (const row of rows) {
        if (!row.ownerId) continue
        const existing = merged.get(row.ownerId) ?? { total: 0, closed: 0, overdueCount: 0, tatHoursSum: 0 }
        existing.total += sign * row.total
        existing.closed += sign * row.closed
        existing.overdueCount += sign * row.overdueCount
        existing.tatHoursSum += sign * (row.avgTatHours ?? 0) * row.closed
        merged.set(row.ownerId, existing)
      }
    }
    accumulate(byAssignee, 1)
    accumulate(byRaiser, 1)
    accumulate(bySelfAssigned, -1)

    return [...merged.entries()].map(([ownerId, v]) => ({
      ownerId,
      total: v.total,
      closed: v.closed,
      overdueCount: v.overdueCount,
      avgTatHours: v.closed > 0 ? Math.round((v.tatHoursSum / v.closed) * 10) / 10 : null,
    }))
  },

  // Backs the sidebar's "Tickets" count badge and its hover breakdown — deliberately "mine"
  // (raiser or assignee), not visibilityFilter's full reach, even for a role that would otherwise
  // see a whole department/store/org. Same reasoning as task.service.ts#summary: those roles
  // already get an org-wide view from the dashboard/admin pages, and a personal nav badge that
  // ballooned the moment someone had elevated access would stop meaning "what's on my plate".
  async summary(user: AccessTokenPayload): Promise<TicketSummaryRow> {
    const mine = or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))!
    const where = and(NOT_DELETED, mine)

    // Same 30s cache/reasoning as task.service.ts#summary and checklistInstance.service.ts#summary.
    return cached(cacheKey("ticket-summary", user.sub), 30, async () => {
      const [row] = await db.select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN ${tickets.status} = 'CLOSED' THEN 1 ELSE 0 END)`,
        overdue: sql<number>`SUM(CASE WHEN ${tickets.isOverdue} THEN 1 ELSE 0 END)`,
        newToday: sql<number>`SUM(CASE WHEN ${tickets.createdAt} >= CURDATE() THEN 1 ELSE 0 END)`,
      }).from(tickets).where(where)

      const total = Number(row?.total ?? 0)
      const completed = Number(row?.completed ?? 0)
      const overdue = Number(row?.overdue ?? 0)
      return {
        total,
        newToday: Number(row?.newToday ?? 0),
        due: total - completed - overdue,
        overdue,
        completed,
      }
    })
  },

  // "Needs your approval" dashboard card (ADMIN/PC only — gated at the route, not here: both
  // roles already resolve to org-wide in visibilityFilter, so calling it here would just be a
  // no-op restriction). Oldest-waiting-first, not newest-first like list()'s default — but
  // Ticket has no "entered PENDING_APPROVAL at" column, so this over-fetches a small pool
  // ordered by createdAt, looks up each row's real transition time from TicketStatusUpdate, and
  // re-sorts by that. Same batch-fetch-then-map shape as populateTickets above, not a derived-
  // table join, since a pending-approval queue is realistically a handful of rows, not thousands.
  async pendingApproval(limit = 8): Promise<TicketPendingApprovalRow[]> {
    const POOL = 40
    const rows = await db.select({
      id: tickets.id,
      title: tickets.title,
      createdAt: tickets.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(tickets)
      .leftJoin(users, eq(tickets.userId, users.id))
      .where(and(eq(tickets.status, "PENDING_APPROVAL"), NOT_DELETED))
      .orderBy(asc(tickets.createdAt))
      .limit(POOL)

    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const sinceRows = await db.select({
      ticketId: ticketStatusUpdates.ticketId,
      // Actually returned as a string by mysql2 for a raw aggregate like this (unlike a plain
      // schema column select, which goes through Drizzle's date-mode conversion) — typed
      // honestly here so the `new Date(...)` wrap below isn't mistaken for defensive-but-dead code.
      since: sql<string>`MAX(${ticketStatusUpdates.createdAt})`,
    })
      .from(ticketStatusUpdates)
      .where(and(inArray(ticketStatusUpdates.ticketId, ids), eq(ticketStatusUpdates.toStatus, "PENDING_APPROVAL")))
      .groupBy(ticketStatusUpdates.ticketId)
    const sinceById = new Map(sinceRows.map((r) => [r.ticketId, r.since]))

    return rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        submittedBy: r.firstName ? `${r.firstName}${r.lastName ? ` ${r.lastName}` : ""}` : null,
        // mysql2 returns a raw sql<Date> aggregate (MAX(...)) as a string, not an actual Date
        // instance — unlike a plain schema column select, which Drizzle's date-mode mapping does
        // convert. new Date(...) normalizes both branches before formatting.
        waitingSince: new Date(sinceById.get(r.id) ?? r.createdAt).toISOString(),
      }))
      .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
      .slice(0, limit)
  },
}
