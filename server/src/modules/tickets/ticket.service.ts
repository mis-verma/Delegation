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
import { auditService } from "../audit/audit.service.js"
import { emitTicketEvent } from "../../sockets/ticketEvent.js"
import { resolveReportRange, bucketSql, utcSql, type ReportGroupBy } from "../checklistInstances/checklistReportRange.js"
import { resolveReportScope } from "../../utils/reportScope.js"
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

// When a ticket is handed over for approval the assignee's clock stops (the SLA sweep skips
// PENDING_APPROVAL), so lateness has to be decided at that moment: a hand-over after the TAT is
// late, one before it is on time, and a later wait for a decision can't change either. Never
// clears an existing flag (already late stays late).
const overdueAtHandOver = (alreadyOverdue: boolean, tatDueAt: Date | null, now: Date): boolean =>
  alreadyOverdue || (tatDueAt !== null && tatDueAt.getTime() < now.getTime())

const round1 = (n: number) => Math.round(n * 10) / 10

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

export const visibilityFilter = async (user: AccessTokenPayload) => {
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
const assertCanVerify = async (ticket: { id: string; departmentId: string | null; assigneeId: string | null }, user: AccessTokenPayload) => {
  // Nobody but an Admin approves a ticket assigned to themselves.
  if (user.role !== "ADMIN" && ticket.assigneeId === user.sub) {
    throw AppError.forbidden("You can't approve a ticket assigned to you. Someone else has to review it.")
  }
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

const isVerifierRole = (user: AccessTokenPayload) => user.role === "ADMIN" || user.role === "PC"

// Named reviewers can approve, so only ADMIN/PC may name them; anyone else could add themselves and
// approve their own ticket.
const assertCanSetReviewers = (reviewerIds: string[] | undefined, user: AccessTokenPayload) => {
  if (reviewerIds !== undefined && !isVerifierRole(user)) {
    throw AppError.forbidden("Only an admin or PC can choose who reviews a ticket.")
  }
}

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

// total/closed/overdueCount describe the tickets CREATED in the window (closed = of those, now
// closed; overdueCount = of those, overdue right now, not closed and not waiting for approval).
// closedInPeriod and avgTatHours describe the tickets CLOSED in the window. closedWithTat/
// closedOnTime/closedLate describe the closed tickets DUE in the window (tatDueAt), the same set the
// scores (Scorecard) and tatReport's on-time split use, on time meaning handed in (submittedAt, else
// closedAt) by tatDueAt.
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
  /** Same as `total`: tickets CREATED in the window. The scores report counts tickets DUE in the window instead. */
  createdCount: number
  /** Same as `closed`: of the tickets created in the window, how many are closed now. */
  createdAndClosedCount: number
  /** Same as `closedWithTat`: closed tickets whose due time falls in the window (open due tickets are not in it). */
  closedDueInWindowCount: number
  /** Distinct tickets behind this row (created, closed or due in the window), for minimum-volume rules. */
  volume: number
  /** The server never invents a default window: no from/to means all time. Clients send explicit dates. */
  windowDefaulted: false
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
  /** Everything not closed: due + overdue. */
  pending: number
  newToday: number
  due: number
  overdue: number
  completed: number
}

export type TicketSummaryScope = "mine" | "visible"

const TICKET_SUMMARY_PREFIX = "ticket-summary"
// Short on purpose: the SLA sweep flips isOverdue and bulk import writes rows, and neither of those
// can invalidate anything.
const SUMMARY_TTL_SECONDS = 10

// Called by every mutation that can change a count. Wipes every user's cached summary, since one
// ticket moves numbers for its raiser, assignee and every manager/admin who can see it.
// Every summary key carries this version (see summary()), so bumping it retires them all in one
// O(1) step instead of a keyspace scan; see versionTag in queryCache.ts.
const TICKET_SUMMARY_VERSION = `${TICKET_SUMMARY_PREFIX}:all`
const dropTicketSummaries = () => bumpVersions(TICKET_SUMMARY_VERSION)

// One grouped SQL aggregate behind ownerStats below — `column` is what to GROUP BY (a department/
// store/assignee id column, or NULL for one ungrouped org-wide row when `grouped` is false). The
// date window is applied per metric (created cohort vs closed cohort, see OwnerStatsRow), so the
// WHERE only needs a ticket to belong to either cohort.
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
  // Closed and due in the window: the on-time cohort (see OwnerStatsRow).
  const closedDueIn = sql`(tickets.status = 'CLOSED' AND tickets.closedAt IS NOT NULL AND tickets.tatDueAt IS NOT NULL AND ${inWindow("tickets.tatDueAt")})`
  const hasWindow = Boolean(window.from || window.to)

  const conditions: SQL[] = [sql`tickets.deletedAt IS NULL`, ...scopeConditions]
  if (hasWindow) conditions.push(sql`(${createdIn} OR ${closedIn} OR ${closedDueIn})`)
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`
  const groupBy = grouped ? sql`GROUP BY ownerId` : sql``

  // db.execute() on the mysql2 driver resolves to the raw mysql2 tuple [rows, fields],
  // NOT a plain row array — must destructure element 0 (see task.service.ts#complianceReport).
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
    // One person's tickets = the ones assigned to them (the same rule ownerStats credits), never the
    // ones they only raised. Honoured for every role that can see other people's work; it is ANDed
    // with visibilityFilter above, so a manager or senior only narrows their own reach. USER/AGENT
    // already see only their own tickets, so the filter means nothing for them and is ignored.
    if (assigneeId && user.role !== "USER" && user.role !== "AGENT") {
      conditions.push(eq(tickets.assigneeId, assigneeId))
    }
    if (overdue !== undefined) conditions.push(eq(tickets.isOverdue, overdue))
    const dateColumn = dateField === "closedAt" ? tickets.closedAt : dateField === "tatDueAt" ? tickets.tatDueAt : tickets.createdAt
    // gte/lte encode through the column's own date mapping (UTC), unlike a raw Date in sql``.
    if (from) conditions.push(gte(dateColumn, new Date(from)))
    if (to) conditions.push(lte(dateColumn, new Date(to)))
    // Same definitions the reports use, so a tile's drill-down lists exactly the tickets it counted:
    // overdue = flagged overdue, not closed and not waiting for approval (handed-in work has stopped the
    // worker's clock); closed on time/late = hand-in time (submittedAt, else closedAt) vs tatDueAt among
    // closed tickets that have a TAT.
    // The reports narrow by resolveReportScope (MANAGER: own department, SENIOR: own store), so the
    // drill-down applies the same scope or a manager's list total would not match the tile.
    if (sla) {
      const scope = resolveReportScope(user, {})
      if (scope.departmentId) conditions.push(eq(tickets.departmentId, scope.departmentId))
      if (scope.storeId) conditions.push(eq(tickets.storeId, scope.storeId))
    }
    if (sla === "overdue_open") conditions.push(eq(tickets.isOverdue, true), ne(tickets.status, "CLOSED"), ne(tickets.status, "PENDING_APPROVAL"))
    // Handed in counts as done (waiting for approval or closed), judged from the hand-in time.
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

  async create(input: CreateTicketInput, user: AccessTokenPayload) {
    assertCanSetReviewers(input.reviewerIds, user)
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
      startDate: input.startDate ? new Date(input.startDate) : null,
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
    } else {
      // Nobody to work it yet: the department's heads (or Admins/PCs) are told so it isn't left unseen.
      await notifySafely(() => notificationService.notifyTicketUnassigned({ _id: id, title: afterRow!.title, departmentId: afterRow!.departmentId }, user.sub))
    }

    await dropTicketSummaries()
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
    assertCanSetReviewers(input.reviewerIds, user)

    // Priority orders the work for the whole team, so only a manager or above re-ranks it. The raiser
    // still sets it once, when the ticket is created.
    if (input.priority !== undefined && input.priority !== ticket.priority && (user.role === "AGENT" || user.role === "USER")) {
      throw AppError.forbidden("Only a manager or above can change a ticket's priority.")
    }

    // Status moves go through the status-update route (remark, history row, alerts) or through verify.
    // The only move left here is a verifier putting a ticket back to Open; anything else on this route
    // skipped those checks (On Hold with no remark, a closed ticket pushed back into review).
    if (input.status !== undefined && input.status !== ticket.status) {
      if (!isVerifierRole(user)) throw AppError.forbidden("Use the status buttons to move this ticket.")
      if (input.status !== "OPEN") throw AppError.badRequest("Use the status buttons to move this ticket.")
    }

    // The due time decides Delayed and the on-time score, so the people working the ticket can't move it:
    // changing it restarts the clock and clears the Delayed mark. Managers and above can, and nobody can
    // once the work is handed in or closed.
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

    // A label on a ticket is permanent: one can be added, never taken off, by anyone (Admin included). Checked
    // before anything is written, so a refused request changes nothing.
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
    // Back to work after it was handed in or closed: counts against compliance (reopenCount).
    if (input.status !== undefined && (before.status === "CLOSED" || before.status === "PENDING_APPROVAL") && input.status !== "CLOSED" && input.status !== "PENDING_APPROVAL") {
      patch.reopenCount = before.reopenCount + 1
    }

    if (input.status === "CLOSED" && before.status !== "CLOSED") {
      // This used to just role-gate (ADMIN/PC) and set closedAt — which let a verifier close a
      // ticket straight from OPEN/IN_PROGRESS/ON_HOLD, skipping both the checklist gate that
      // normally has to clear on the way into PENDING_APPROVAL (see the branch below) and the
      // verification record itself (verifiedBy/verifiedAt/verificationNote all stayed null, so
      // VerificationNoteBanner had nothing to show for a "closed" ticket). Closing is a
      // verification decision, not a plain status change — verify() (PATCH /tickets/:id/verify,
      // action=APPROVE) is the one place that sets all three atomically under the same
      // optimistic-concurrency guard, and is now the only way to reach CLOSED going forward.
      throw AppError.badRequest("A ticket is closed by approving it. Mark it completed first, then approve it.")
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
        throw AppError.forbidden("Only an admin or PC can reopen a closed ticket.")
      }
      patch.closedAt = null;
      // The old verification is no longer valid for whatever state the ticket moves back into —
      // clear it so the record doesn't keep showing a verifiedBy/verifiedAt/verificationNote for
      // a decision that no longer describes the ticket's current state.
      patch.verifiedBy = null;
      patch.verifiedAt = null;
      patch.verificationNote = null;
    }

    if (input.startDate !== undefined) {
      patch.startDate = input.startDate ? new Date(input.startDate) : null
    }

    if (input.tatHours !== undefined && input.tatHours !== before.tatHours) {
      patch.tatHours = input.tatHours ?? null
      patch.tatDueAt = deriveTatDueAt(input.tatHours ?? null, new Date())
      patch.isOverdue = false
    }

    // Stamped in the same UPDATE as the status change (the sweep skips PENDING_APPROVAL, so nothing
    // else will ever decide it): a hand-over after the TAT is late, before it is on time.
    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      const effectiveTatDueAt = patch.tatDueAt !== undefined ? patch.tatDueAt : before.tatDueAt
      patch.isOverdue = overdueAtHandOver(patch.isOverdue ?? before.isOverdue, effectiveTatDueAt, new Date())
      patch.submittedAt = new Date()
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
      await notifySafely(async () => notificationService.notifyPendingVerification({ ...notificationTarget(afterRow!), reviewerIds: await ticketReviewerIds(id) }));
    }

    await dropTicketSummaries()
    return populated;
  },

  async addStatusUpdate(id: string, input: StatusUpdateInput, files: Express.Multer.File[], user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    assertCanMutate(user, ticket)

    // Front-line staff move only the work they are doing: for USER/AGENT that means the assignee.
    // Someone who only raised the ticket can still edit or withdraw it, just not move it.
    if ((user.role === "AGENT" || user.role === "USER") && ticket.assigneeId !== user.sub) {
      throw AppError.forbidden("Only the person working on this ticket can change its status.")
    }

    const before = ticket;

    // Moving a ticket to the status it is already in is not a move. Without this a double tap on
    // "Update status" wrote the same step twice into the ticket's history.
    if (input.status === before.status) {
      throw AppError.conflict("This ticket is already in that status.")
    }
    // Closed is final for the people working it, and handed-in work waits for the reviewer: only a verifier
    // can move a ticket out of either (the reviewer's Reject is the way back to work).
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
    // Back to work after it was handed in or closed: counts against compliance (reopenCount).
    if ((before.status === "CLOSED" || before.status === "PENDING_APPROVAL") && input.status !== "PENDING_APPROVAL") {
      patch.reopenCount = before.reopenCount + 1
    }
    if (before.status === "CLOSED") {
      patch.closedAt = null;
      // The old approval no longer describes the ticket once it is reopened.
      patch.verifiedBy = null;
      patch.verifiedAt = null;
      patch.verificationNote = null;
    }
    // Same hand-over stamp as update() — decided now, in the same UPDATE, because the SLA sweep
    // never looks at a PENDING_APPROVAL ticket.
    if (input.status === "PENDING_APPROVAL" && before.status !== "PENDING_APPROVAL") {
      patch.isOverdue = overdueAtHandOver(before.isOverdue, before.tatDueAt, new Date())
      // On time is judged from this hand-in moment (see the reports), not from when it is approved.
      patch.submittedAt = new Date()
    }

    const statusUpdateId = createId()
    await db.insert(ticketStatusUpdates).values({
      id: statusUpdateId,
      ticketId: id,
      changedBy: user.sub,
      fromStatus: before.status,
      toStatus: input.status,
      // Empty (not null: the column is NOT NULL) when the move needed no explanation. Readers
      // already skip a blank remark.
      remark: input.remark ?? "",
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
      await notifySafely(async () => notificationService.notifyPendingVerification({ ...notificationTarget(afterRow!), reviewerIds: await ticketReviewerIds(id) }));
    }

    if (input.status === "ON_HOLD" && before.status !== "ON_HOLD") {
      await notifySafely(() => notificationService.notifyTicketOnHold(notificationTarget(afterRow!), input.remark ?? "", user.sub));
    }

    await dropTicketSummaries()
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
      // A send-back counts against compliance, the same as a checklist question sent back.
      patch.reopenCount = ticket.reopenCount + 1;
    }
    // Optimistic-concurrency guard: the WHERE clause re-checks the status this row was read at
    // atomically inside the UPDATE itself, so two concurrent verify calls can't both "win" — only
    // the first write matches and the second gets affectedRows === 0 instead of racing to a bad
    // final state.
    const [result] = await db.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.status, fromStatus), NOT_DELETED))
    if (result.affectedRows === 0) {
      throw AppError.badRequest("This ticket isn't pending approval.")
    }

    // A send-back is a real move back to work, so it gets its own history step with the reviewer's
    // note; without it the history jumped from Pending Approval straight to the next In Progress
    // move with nothing in between. Approval needs no row: the history reads closedAt/verifiedAt.
    // Written only after the guarded UPDATE won, so a losing concurrent call can't add a second one.
    if (input.action === "REJECT") {
      await db.insert(ticketStatusUpdates).values({
        id: createId(),
        ticketId: id,
        changedBy: user.sub,
        fromStatus: fromStatus,
        toStatus: "IN_PROGRESS",
        remark: input.note?.trim() ?? "",
      })
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
    await dropTicketSummaries()
    return populated;
  },

  // Soft delete: sets deletedAt instead of removing the row (and used to also hard-delete every
  // child Checklist/ChecklistItem/ChecklistImage/TicketAttachment/TicketComment/TicketStatusUpdate
  // row in a transaction, plus unlink their uploaded files from disk — see git history for that
  // cascade if it's ever needed again). Nothing else is touched: children stay exactly as they
  // were so the ticket is fully recoverable, not just its own row. Every read path in this file
  // (list/getById/update/addStatusUpdate/verify/reports) hides it from here on via NOT_DELETED.
  //
  // ADMIN/PC can delete any ticket. Anyone else can only withdraw a ticket they raised themselves,
  // and only while nobody has started on it: still OPEN with no status history at all. Once work
  // has begun (or it was ever moved and moved back), the history belongs to the people working it.
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
      // Tells a raiser's own withdrawal apart from an admin removing someone else's ticket.
      after: withdrawn ? { withdrawnByRaiser: true } : undefined,
    })
    await dropTicketSummaries()
    return ticket;
  },

  // Bucketed ticket report. Three cohorts, deliberately separate:
  //  - CLOSED in the bucket (by closedAt): closedCount and avgTatHours ("avg time to close", elapsed
  //    createdAt -> closedAt).
  //  - DUE in the bucket (by tatDueAt) and closed: the on-time split, the same set the scores
  //    (Scorecard) judge on time, so the two percentages agree. A closed ticket is on time when handed
  //    in (submittedAt, else closedAt) by tatDueAt, late after it (closedWithTatCount is the denominator).
  //  - CREATED in the bucket (by createdAt): createdCount and overdueCount, which is tickets that
  //    are overdue RIGHT NOW, not closed and not waiting for approval (handed-in work has stopped the
  //    worker's clock).
  // Every bucket in the requested window is returned (zero-filled: null rate, 0 counts) so the
  // client's "previous" bucket is really the previous period. groupBy 'none' = one bucket, 'range'.
  // Two plain queries merged in JS (MySQL has no $facet equivalent, and each is a single indexed
  // GROUP BY).
  async tatReport(groupBy: ReportGroupBy, from?: string, to?: string, departmentId?: string, storeId?: string) {
    const range = resolveReportRange(groupBy, from, to)

    const scope: SQL[] = [sql`tickets.deletedAt IS NULL`]
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

    // db.execute() on the mysql2 driver resolves to the raw mysql2 tuple [rows, fields],
    // NOT a plain row array — must destructure element 0 (see task.service.ts#complianceReport).
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
      // closed / created, unclamped (above 100 means the backlog shrank). null whenever nothing was
      // created in the bucket: there is no denominator, so closures without raised tickets stay in
      // closedCount instead of reading as closed x 100.
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
        // Same number as completionRate under an honest name: closed in the bucket / created in the bucket.
        // Two different cohorts, so it can pass 100, and it is NOT the scores report's completion (closed / due).
        closedVsCreatedPct: completionRate,
      }
    })
  },

  /**
   * The "who's doing well" numbers behind the department/store ranking tables, the team
   * leaderboard and the org-wide on-time/overdue stat cards on OrgOverview: real GROUP BY
   * aggregates (see ownerStatsByColumn for the exact cohorts), so they are right at any ticket
   * count and use the same definitions as tatReport above (overdue = overdue now, not closed and not
   * waiting for approval; closed on time = handed in (submittedAt, else closedAt) by tatDueAt among
   * closed tickets due in the period; avg time to close = tickets closed in the period).
   *
   * scope 'user' credits the ASSIGNEE only (one grouped query, not the old assignee + raiser +
   * self-assigned merge): a person is judged on work handed to them, never on tickets they merely
   * raised. `volume` is how many distinct tickets the row covers (created or closed in the
   * window), for the client's minimum-volume rule.
   */
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

  // Backs the sidebar's "Tickets" count badge and its hover breakdown — deliberately "mine"
  // (raiser or assignee), not visibilityFilter's full reach, even for a role that would otherwise
  // see a whole department/store/org. Same reasoning as task.service.ts#summary: those roles
  // already get an org-wide view from the dashboard/admin pages, and a personal nav badge that
  // ballooned the moment someone had elevated access would stop meaning "what's on my plate".
  //
  // `scope` picks what is counted: 'mine' (the default, and the badge's own rule) is tickets
  // assigned to or raised by the caller; 'visible' is everything the caller's role can see
  // (visibilityFilter: ADMIN/PC the org, MANAGER their department and store, SENIOR their store,
  // USER/AGENT their own). `pending` is every ticket not closed (due + overdue); `overdue` is the
  // SLA flag on a ticket that is still open and not waiting for approval.
  async summary(user: AccessTokenPayload, scope: TicketSummaryScope = "mine"): Promise<TicketSummaryRow> {
    // Short TTL plus explicit invalidation from every mutation below (dropTicketSummaries). The TTL
    // covers what has no hook: bulk import and the SLA sweep flipping isOverdue.
    const version = await versionTag(TICKET_SUMMARY_VERSION)
    return cached(cacheKey(TICKET_SUMMARY_PREFIX, `v${version}`, scope, user.sub), SUMMARY_TTL_SECONDS, async () => {
      const scopeCondition = scope === "visible"
        ? await visibilityFilter(user)
        : or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))
      const where = and(NOT_DELETED, scopeCondition)

      const [row] = await db.select({
        total: sql<number>`COUNT(*)`,
        // Handed in (waiting for approval) counts as completed, the same as in the scores.
        completed: sql<number>`SUM(CASE WHEN ${tickets.status} IN ('CLOSED', 'PENDING_APPROVAL') THEN 1 ELSE 0 END)`,
        // Waiting for approval is never overdue: the worker's clock stopped when they handed it in.
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

  // "Needs your approval" dashboard card (ADMIN/PC only — gated at the route, not here: both
  // roles already resolve to org-wide in visibilityFilter, so calling it here would just be a
  // no-op restriction). Oldest-waiting-first, not newest-first like list()'s default — but
  // Ticket has no "entered PENDING_APPROVAL at" column, so this over-fetches a small pool
  // ordered by createdAt, looks up each row's real transition time from TicketStatusUpdate, and
  // re-sorts by that. Same batch-fetch-then-map shape as populateTickets above, not a derived-
  // table join, since a pending-approval queue is realistically a handful of rows, not thousands.
  //
  // `meta.total` is the real number awaiting approval (COUNT over the same filter): the card shows
  // at most `limit` rows, and its badge used to count those rows instead.
  async pendingApproval(limit = 8): Promise<{ data: TicketPendingApprovalRow[]; meta: { total: number } }> {
    const POOL = 40
    const pendingWhere = and(eq(tickets.status, "PENDING_APPROVAL"), NOT_DELETED)
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
      // Actually returned as a string by mysql2 for a raw aggregate like this (unlike a plain
      // schema column select, which goes through Drizzle's date-mode conversion) — typed
      // honestly here so the `new Date(...)` wrap below isn't mistaken for defensive-but-dead code.
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
        // mysql2 returns a raw sql<Date> aggregate (MAX(...)) as a string, not an actual Date
        // instance — unlike a plain schema column select, which Drizzle's date-mode mapping does
        // convert. new Date(...) normalizes both branches before formatting.
        waitingSince: new Date(sinceById.get(r.id) ?? r.createdAt).toISOString(),
      }))
      .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
      .slice(0, limit)
    return { data, meta: { total } }
  },
}
