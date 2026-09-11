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
  checklists,
  checklistItems,
  checklistImages,
  users,
} from "../../db/schema/index.js"
import { eq, and, or, inArray, desc, asc, sql } from "drizzle-orm"
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
import { unlinkUploadUrls } from "../../utils/uploadCleanup.js"

type TicketRow = typeof tickets.$inferSelect

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
  }))
}

const getPopulatedTicket = async (id: string) => {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
  if (!row) return undefined
  const [populated] = await populateTickets([row])
  return populated
}

// checklists -> items only, used by the IN_REVIEW checklist-completeness gate (no images/photos
// needed there — see assertChecklistsResolved).
const getTicketChecklistsWithItems = async (ticketId: string) => {
  const checklistRows = await db.select().from(checklists).where(eq(checklists.ticketId, ticketId))
  const checklistIds = checklistRows.map((c) => c.id)
  const itemRows = checklistIds.length ? await db.select().from(checklistItems).where(inArray(checklistItems.checklistId, checklistIds)) : []
  const itemsByChecklist = groupBy(itemRows, (i) => i.checklistId)
  return checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }))
}

const visibilityFilter = (user: AccessTokenPayload) => {
  // PC has the same org-wide access as ADMIN — same as tasks (see task.service.ts's own
  // visiblityFilter), so a PC user isn't blocked from other departments' tickets.
  if (user.role === "ADMIN" || user.role === "PC") return undefined

  if (user.role === "MANAGER") {
    const or_conditions = [eq(tickets.userId, user.sub)]
    if (user.departmentId) or_conditions.push(eq(tickets.departmentId, user.departmentId))
    if (user.storeId) or_conditions.push(eq(tickets.storeId, user.storeId))
    return or(...or_conditions)
  }

  // SENIOR is store-only (no department fallback) — an Area Head oversees exactly one store.
  if (user.role === "SENIOR") {
    return user.storeId ? eq(tickets.storeId, user.storeId) : eq(tickets.userId, user.sub)
  }

  // A ticket assigned to/raised by this user is always visible to them, regardless of
  // department — a MANAGER/ADMIN can route a ticket to someone outside its department, and
  // ANDing department here would make that assignee's own ticket invisible to them. task.service
  // ts's equivalent visibility check has no department restriction on "it's mine" either.
  if (user.role === "AGENT" || user.role === "USER") {
    return or(eq(tickets.assigneeId, user.sub), eq(tickets.userId, user.sub))!
  }

  return eq(tickets.userId, user.sub)
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
    const conditions = []
    const vis = visibilityFilter(user)
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
      const vis = visibilityFilter(user)
      const conditions = [eq(tickets.id, id)]
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

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)

    await auditService.record({
      entityType: "Ticket",
      entityId: id,
      action: "CREATE",
      actorId: user.sub,
      after: afterRow,
    })

    const populated = await getPopulatedTicket(id)
    emitTicketEvent("ticket:created", roomTarget(afterRow!), populated)

    if (afterRow!.assigneeId) {
      await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)))
    }

    return populated;
  },

  async update(id: string, input: UpdateTicketInput, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
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

      if (user.role !== "ADMIN" && user.role !== "PC") {
        throw AppError.forbidden("Only a verifier can close a ticket — send it for review instead.")
      }
      patch.closedAt = new Date();
    } else if (input.status === "IN_REVIEW" && before.status !== "IN_REVIEW") {
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

    if (input.assigneeId && input.assigneeId !== before.assigneeId) {
      emitTicketEvent("ticket:assigned", target, populated)
      await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)));
    }

    if (input.status === "IN_REVIEW" && before.status !== "IN_REVIEW") {
      await notifySafely(() => notificationService.notifyPendingVerification(notificationTarget(afterRow!)));
    }

    return populated;
  },

  async addStatusUpdate(id: string, input: StatusUpdateInput, files: Express.Multer.File[], user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")
    assertCanMutate(user, ticket)

    const before = ticket;

    if (input.status === "IN_REVIEW" && before.status !== "IN_REVIEW") {
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

    if (input.status === "IN_REVIEW" && before.status !== "IN_REVIEW") {
      await notifySafely(() => notificationService.notifyPendingVerification(notificationTarget(afterRow!)));
    }

    if (input.status === "ON_HOLD" && before.status !== "ON_HOLD") {
      await notifySafely(() => notificationService.notifyTicketOnHold(notificationTarget(afterRow!), input.remark, user.sub));
    }

    return populated;
  },


  async verify(id: string, input: VerifyTicketInput, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")

    if (ticket.status !== "IN_REVIEW") {
      throw AppError.badRequest("This ticket isn't pending verification.")
    }

    const before = ticket;
    const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() }

    if (input.action === "APPROVE") {
      patch.status = "CLOSED";
      patch.closedAt = new Date();
      patch.verifiedBy = user.sub;
      patch.verifiedAt = new Date();
      patch.verificationNote = input.note ?? null;
    } else {
      patch.status = "IN_PROGRESS";
      patch.verificationNote = input.note ?? null;
    }
    // Optimistic-concurrency guard: the WHERE clause re-checks status === "IN_REVIEW" atomically
    // inside the UPDATE itself, so two concurrent verify calls can't both "win" — only the first
    // write matches and the second gets affectedRows === 0 instead of racing to a bad final state.
    const [result] = await db.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.status, "IN_REVIEW")))
    if (result.affectedRows === 0) {
      throw AppError.badRequest("This ticket isn't pending verification.")
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

  async remove(id: string, user: AccessTokenPayload) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    if (!ticket) throw AppError.notFound("Ticket not found")

    // wrapped in a transaction (source had none) — the old Mongo `findByIdAndDelete` left every
    // child Checklist/ChecklistItem/ChecklistImage/TicketAttachment/TicketComment/
    // TicketStatusUpdate document orphaned with no referential integrity to stop it; MySQL's FK
    // constraints on those tables (`ON DELETE no action`) would otherwise reject deleting a
    // Ticket that still has children, so the cascade is now done explicitly here.
    // File urls are collected before each table is deleted, and unlinked (best-effort) only after
    // the transaction commits — deleting a ticket used to only remove the DB rows, silently
    // orphaning the actual evidence photos/attachments on disk forever (no retention sweep catches
    // this the way it does for audit logs/notifications/inbound messages).
    const orphanedUrls: string[] = []
    await db.transaction(async (tx) => {
      const childChecklists = await tx.select({ id: checklists.id }).from(checklists).where(eq(checklists.ticketId, id))
      const checklistIds = childChecklists.map((c) => c.id)
      if (checklistIds.length) {
        const childItems = await tx.select({ id: checklistItems.id }).from(checklistItems).where(inArray(checklistItems.checklistId, checklistIds))
        const itemIds = childItems.map((i) => i.id)
        if (itemIds.length) {
          const images = await tx.select({ url: checklistImages.url }).from(checklistImages).where(inArray(checklistImages.checklistItemId, itemIds))
          orphanedUrls.push(...images.map((i) => i.url))
          await tx.delete(checklistImages).where(inArray(checklistImages.checklistItemId, itemIds))
        }
        await tx.delete(checklistItems).where(inArray(checklistItems.checklistId, checklistIds))
        await tx.delete(checklists).where(eq(checklists.ticketId, id))
      }
      const attachments = await tx.select({ url: ticketAttachments.url }).from(ticketAttachments).where(eq(ticketAttachments.ticketId, id))
      orphanedUrls.push(...attachments.map((a) => a.url))
      await tx.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, id))
      await tx.delete(ticketComments).where(eq(ticketComments.ticketId, id))
      await tx.delete(ticketStatusUpdates).where(eq(ticketStatusUpdates.ticketId, id))
      await tx.delete(tickets).where(eq(tickets.id, id))
    })
    unlinkUploadUrls(orphanedUrls)

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
    const closedConditions: ReturnType<typeof sql>[] = [sql`tickets.closedAt IS NOT NULL`];
    if (from) closedConditions.push(sql`tickets.closedAt >= ${new Date(from)}`);
    if (to) closedConditions.push(sql`tickets.closedAt <= ${new Date(to)}`);
    if (departmentId) closedConditions.push(sql`tickets.departmentId = ${departmentId}`);
    if (storeId) closedConditions.push(sql`tickets.storeId = ${storeId}`);

    const createdConditions: ReturnType<typeof sql>[] = [];
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
    const baseConditions: ReturnType<typeof sql>[] = []
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
    // merged by user id below. Known, accepted gap versus the old exact behavior: a self-assigned
    // ticket (assigneeId === userId) is credited twice here instead of once, since it's a row in
    // both result sets — judged not worth a UNION DISTINCT over ticket ids for what both reviews
    // agreed was a minor leaderboard input, not a correctness-critical number.
    const [byAssignee, byRaiser] = await Promise.all([
      ownerStatsByColumn(sql`tickets.assigneeId`, [...baseConditions, sql`tickets.assigneeId IS NOT NULL`], true),
      ownerStatsByColumn(sql`tickets.userId`, baseConditions, true),
    ])
    const merged = new Map<string, OwnerStatsRow>()
    for (const row of [...byAssignee, ...byRaiser]) {
      if (!row.ownerId) continue
      const existing = merged.get(row.ownerId)
      if (!existing) { merged.set(row.ownerId, row); continue }
      const closed = existing.closed + row.closed
      const totalTatHours = (existing.avgTatHours ?? 0) * existing.closed + (row.avgTatHours ?? 0) * row.closed
      merged.set(row.ownerId, {
        ownerId: row.ownerId,
        total: existing.total + row.total,
        closed,
        overdueCount: existing.overdueCount + row.overdueCount,
        avgTatHours: closed > 0 ? Math.round((totalTatHours / closed) * 10) / 10 : null,
      })
    }
    return [...merged.values()]
  },
}
