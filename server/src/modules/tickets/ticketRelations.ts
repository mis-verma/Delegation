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
import { eq, and, inArray, desc, asc } from "drizzle-orm"
import { type TicketRow, NOT_DELETED, userCols, groupBy, type Executor } from "./ticketShared.js"

export const tagsByTicket = async (ticketIds: string[]) => {
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

export const syncTicketTags = async (executor: Executor, ticketId: string, tagIds: string[]) => {
  await executor.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId))
  if (!tagIds.length) return

  const unique = [...new Set(tagIds)]
  const existing = await executor.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique))
  if (!existing.length) return

  await executor.insert(ticketTags).values(existing.map((tag) => ({ ticketId, tagId: tag.id })))
}

export const ticketTagIds = async (ticketId: string): Promise<string[]> =>
  (await db.select({ tagId: ticketTags.tagId }).from(ticketTags).where(eq(ticketTags.ticketId, ticketId)))
    .map((r) => r.tagId).sort()

export const ticketReviewerIds = async (ticketId: string): Promise<string[]> =>
  (await db.select({ userId: ticketReviewers.userId }).from(ticketReviewers).where(eq(ticketReviewers.ticketId, ticketId)))
    .map((r) => r.userId).sort()

export const reviewerTicketIds = async (userId: string): Promise<string[]> => {
  const rows = await db.select({ ticketId: ticketReviewers.ticketId }).from(ticketReviewers).where(eq(ticketReviewers.userId, userId))
  return rows.map((r) => r.ticketId)
}

export const syncTicketReviewers = async (executor: Executor, ticketId: string, userIds: string[]) => {
  await executor.delete(ticketReviewers).where(eq(ticketReviewers.ticketId, ticketId))
  if (!userIds.length) return
  const unique = [...new Set(userIds)]
  await executor.insert(ticketReviewers).values(unique.map((userId) => ({ ticketId, userId })))
}

export const reviewersByTicket = async (ticketIds: string[]) => {
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

export const populateTickets = async (ticketRows: TicketRow[]) => {
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

export const getPopulatedTicket = async (id: string) => {
  const [row] = await db.select().from(tickets).where(and(eq(tickets.id, id), NOT_DELETED)).limit(1)
  if (!row) return undefined
  const [populated] = await populateTickets([row])
  return populated
}

export const getTicketChecklistsWithItems = async (ticketId: string) => {
  const checklistRows = await db.select().from(checklists).where(eq(checklists.ticketId, ticketId))
  const checklistIds = checklistRows.map((c) => c.id)
  const itemRows = checklistIds.length ? await db.select().from(checklistItems).where(inArray(checklistItems.checklistId, checklistIds)) : []
  const itemsByChecklist = groupBy(itemRows, (i) => i.checklistId)
  return checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }))
}
