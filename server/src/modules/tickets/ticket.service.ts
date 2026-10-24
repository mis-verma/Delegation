import path from "node:path"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import {
  tickets,

  ticketStatusUpdates,
  ticketAttachments,

} from "../../db/schema/index.js"
import { eq, and, inArray, notInArray, sql, gte, lte, ne, isNotNull, type SQL } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTicketInput, ListTicketsQuery, UpdateTicketInput, VerifyTicketInput, StatusUpdateInput } from "./ticket.validation.js"
import { ticketBucketCondition, ticketListCounts, ticketListOrder, ticketOptionConditions, ticketScopeConditions } from "./ticketListQuery.js"
import { auditService, type DbTransaction } from "../audit/audit.service.js"
import { emitTicketEvent } from "../../sockets/ticketEvent.js"
import { resolveReportScope } from "../../utils/reportScope.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { settingsService } from "../settings/settings.service.js"
import { assignmentNeedsHeadApproval, canApproveAssignment, isDepartmentHead, resolveGateDepartment } from "./ticketApproval.js"
import { isAdminOrPc, isDepartmentHeadRole, isOwnScopeRole } from "../../utils/roles.js"
import { type TicketRow, NOT_DELETED, deriveTatDueAt, overdueAtHandOver } from "./ticketShared.js"
import { visibilityFilter, assertCanVerify, assertCanMutate, isVerifierRole, assertCanSetReviewers } from "./ticketAccess.js"
import { syncTicketTags, ticketTagIds, ticketReviewerIds, syncTicketReviewers, populateTickets, getPopulatedTicket, getTicketChecklistsWithItems } from "./ticketRelations.js"
import { dropTicketSummaries, tatReport, ownerStats, summary, pendingApproval } from "./ticketReports.js"
export { visibilityFilter, assertCanMutate } from "./ticketAccess.js"
export type { OwnerStatsRow, TicketPendingApprovalRow, TicketSummaryRow, TicketSummaryScope } from "./ticketReports.js"

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

const STALE_TICKET_MESSAGE = "Someone changed this ticket a moment ago. Open it again and retry."

export const ticketService = {
  async list(user: AccessTokenPayload, query: ListTicketsQuery) {
    const { page, limit, status, assigneeId, overdue, from, to, dateField, sla, sort = "createdAt", bucket } = query
    const conditions = [NOT_DELETED]
    const vis = await visibilityFilter(user)
    if (vis) conditions.push(vis)
    if (status) conditions.push(eq(tickets.status, status as TicketRow["status"]))
    if (assigneeId && !isOwnScopeRole(user.role)) {
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
    if (sla === "not_done") conditions.push(notInArray(tickets.status, ["CLOSED", "PENDING_APPROVAL"]))
    if (sla === "closed_late") conditions.push(inArray(tickets.status, ["CLOSED", "PENDING_APPROVAL"]), isNotNull(tickets.tatDueAt), sql`COALESCE(${tickets.submittedAt}, ${tickets.closedAt}) > ${tickets.tatDueAt}`)
    if (sla === "closed_on_time") conditions.push(inArray(tickets.status, ["CLOSED", "PENDING_APPROVAL"]), isNotNull(tickets.tatDueAt), sql`COALESCE(${tickets.submittedAt}, ${tickets.closedAt}) <= ${tickets.tatDueAt}`)
    conditions.push(...ticketScopeConditions({
      viewerId: user.sub,
      handledBy: query.handledBy,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      dueFrom: query.dueFrom,
      dueTo: query.dueTo,
      departmentId: query.departmentId,
      storeId: query.storeId,
    }).filter((c): c is SQL => !!c))
    const baseWhere = and(...conditions)

    const optionList = ticketOptionConditions({
      status: query.filterStatus,
      priority: query.priority,
      departmentId: query.filterDepartmentId,
      assigneeIds: query.assigneeIds,
      raisedByIds: query.raisedByIds,
      labelIds: query.labelIds,
      search: query.q,
    }).filter((c): c is SQL => !!c)
    const optionWhere = optionList.length ? and(...optionList) : undefined
    const where = and(baseWhere, optionWhere, bucket ? ticketBucketCondition(bucket) : undefined)

    const [rows, counts] = await Promise.all([
      db.select().from(tickets).where(where).orderBy(...ticketListOrder(sort)).offset((page - 1) * limit).limit(limit),
      ticketListCounts(baseWhere, optionWhere, bucket),
    ])
    const data = await populateTickets(rows)
    const total = counts.matched
    return {
      data,
      meta: {
        page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total,
        counts: { scope: counts.scopeTotal, pending: counts.pending, completed: counts.completed, due: counts.due, delayed: counts.delayed },
      },
    }
  },

  async getById(id: string, user: AccessTokenPayload) {
    const ticket = await getPopulatedTicket(id)

    if (!ticket) throw AppError.notFound("Ticket not found");
    if (!isAdminOrPc(user.role)) {
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
    const departmentId = await resolveGateDepartment(input.departmentId ?? null, input.assigneeId ?? null, user)
    const needsHead = await assignmentNeedsHeadApproval({ departmentId }, user)
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
        departmentId,
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
    if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== ticket.updatedAt.getTime()) {
      throw AppError.conflict(STALE_TICKET_MESSAGE)
    }

    if (ticket.declinedAt && input.status !== undefined && input.status !== ticket.status) {
      throw AppError.badRequest("This ticket was declined. Use Reopen ticket to bring it back.")
    }

    if ((input.assigneeId !== undefined || input.departmentId !== undefined) && (isOwnScopeRole(user.role))) {
      throw AppError.forbidden("Only a manager or above can reassign a ticket's assignee or department.")
    }
    assertCanSetReviewers(input.reviewerIds, user)

    if (input.priority !== undefined && input.priority !== ticket.priority && (isOwnScopeRole(user.role))) {
      throw AppError.forbidden("Only a manager or above can change a ticket's priority.")
    }

    if (input.status !== undefined && input.status !== ticket.status) {
      if (!isVerifierRole(user)) throw AppError.forbidden("Use the status buttons to move this ticket.")
      if (input.status !== "OPEN") throw AppError.badRequest("Use the status buttons to move this ticket.")
    }

    if (input.tatHours !== undefined && input.tatHours !== ticket.tatHours) {
      if (isOwnScopeRole(user.role)) {
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
      if (!isAdminOrPc(user.role)) {
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

    const touchesPlacement = input.assigneeId !== undefined || input.departmentId !== undefined
    const nextAssigneeId = input.assigneeId !== undefined ? input.assigneeId : before.assigneeId
    const followsAssignee = input.assigneeId !== undefined && input.departmentId === undefined && !!nextAssigneeId
    const requestedDepartmentId = followsAssignee ? null : patch.departmentId !== undefined ? patch.departmentId : before.departmentId
    const resolvedDepartmentId = touchesPlacement ? await resolveGateDepartment(requestedDepartmentId, nextAssigneeId, user) : requestedDepartmentId
    const nextDepartmentId = resolvedDepartmentId ?? before.departmentId
    if (touchesPlacement && nextDepartmentId !== before.departmentId) patch.departmentId = nextDepartmentId
    const reassigned = (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) || (input.departmentId !== undefined && input.departmentId !== before.departmentId)
    let nowAwaitingHead = false
    if (reassigned && ["OPEN", "IN_PROGRESS", "ON_HOLD"].includes(before.status) && !before.declinedAt) {
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
      const [written] = await tx.update(tickets).set(patch).where(and(eq(tickets.id, id), eq(tickets.status, before.status), eq(tickets.updatedAt, before.updatedAt), NOT_DELETED))
      if (written.affectedRows === 0) throw AppError.conflict(STALE_TICKET_MESSAGE)
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
      if (!nowAwaitingHead) await notifySafely(() => notificationService.notifyTicketAssigned(notificationTarget(afterRow!)));
    }
    if (nowAwaitingHead) await notifySafely(() => notificationService.notifyTicketAwaitingHead(notificationTarget(afterRow!)))

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

    if ((isOwnScopeRole(user.role)) && ticket.assigneeId !== user.sub) {
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
    const isHead = (isDepartmentHeadRole(user.role)) && !!user.departmentId && ticket.departmentId === user.departmentId
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
    const [removed] = await db.update(tickets).set({ deletedAt, updatedAt: deletedAt }).where(and(eq(tickets.id, id), eq(tickets.status, ticket.status), eq(tickets.updatedAt, ticket.updatedAt), NOT_DELETED))
    if (removed.affectedRows === 0) throw AppError.conflict(STALE_TICKET_MESSAGE)

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

  tatReport,
  ownerStats,
  summary,
  pendingApproval,
}
