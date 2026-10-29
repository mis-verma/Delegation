import { db } from '../../config/db.js';
import { users } from '../../db/schema/core.js';
import { eq, and, inArray } from 'drizzle-orm';
import { notifyMany, activeVerifierIds, activeEscalationIds, type VerifiableEntity } from './notificationCore.js';

export const notifyTicketAssigned = async (ticket: { _id: string; title: string; departmentId?: string | null; assigneeId?: string | null }) => {
  const recipientIds: string[] = [];

  const assigneeId = ticket.assigneeId ? ticket.assigneeId.toString() : null;
  if (assigneeId) recipientIds.push(assigneeId);

  const sent = await notifyMany(recipientIds, {
    type: 'TICKET_ASSIGNED',
    title: 'Ticket assigned to you',
    message: `Ticket "${ticket.title}" has been assigned to you.`,
    ticketId: ticket._id.toString(),
  });

  if (!ticket.departmentId) return sent;
  const heads = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
  const headIds = heads.map((h) => h.id).filter((id) => id !== assigneeId);
  const toHeads = await notifyMany(headIds, {
    type: 'TICKET_TO_DEPARTMENT',
    title: 'Ticket sent to your department',
    message: `"${ticket.title}" was assigned to someone in your department. Open it to check, reassign it, or decline it.`,
    ticketId: ticket._id.toString(),
  });
  return [...sent, ...toHeads];
}

export const notifyTicketAwaitingHead = async (ticket: { _id: string; title: string; departmentId?: string | null; assigneeId?: string | null; userId?: string | null }) => {
  if (!ticket.departmentId) return [];
  const raiserId = ticket.userId ? ticket.userId.toString() : null;
  const heads = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
  return notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
    type: 'TICKET_AWAITING_HEAD',
    title: 'New ticket needs your approval',
    message: `"${ticket.title}" was raised for your department. Approve it first, then the team can work on it.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyHeadDecisionReminder = async (ticket: { _id: string; title: string; departmentId?: string | null; userId?: string | null }, hoursWaiting: number) => {
  if (!ticket.departmentId) return [];
  const raiserId = ticket.userId ? ticket.userId.toString() : null;
  const heads = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
  return notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
    type: 'TICKET_AWAITING_HEAD_REMINDER',
    title: 'A ticket is waiting for your decision',
    message: `"${ticket.title}" has waited ${hoursWaiting} hours. Nobody can start until you approve or decline it.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyHeadDecisionEscalation = async (ticket: { _id: string; title: string }, hoursWaiting: number) => {
  return notifyMany(await activeEscalationIds(), {
    type: 'TICKET_AWAITING_HEAD_ESCALATION',
    title: 'Department head has not decided',
    message: `"${ticket.title}" has waited ${hoursWaiting} hours for the department head. You can approve or decline it now.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyStaleWork = async (ticket: { _id: string; title: string; assigneeId?: string | null }, hoursQuiet: number) => {
  const assigneeId = ticket.assigneeId?.toString();
  if (!assigneeId) return [];
  return notifyMany([assigneeId], {
    type: 'TICKET_STALE_REMINDER',
    title: 'Add a quick update',
    message: `"${ticket.title}" has had no update for ${hoursQuiet} hours. Post a short note so everyone knows where it stands.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketHeadApproved = async (ticket: { _id: string; title: string; userId?: string | null; assigneeId?: string | null }, actorId: string) => {
  const ids = [ticket.assigneeId?.toString(), ticket.userId?.toString()].filter((id): id is string => !!id && id !== actorId);
  const [approver] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, actorId)).limit(1);
  const approverName = approver ? `${approver.firstName}${approver.lastName ? ` ${approver.lastName}` : ''}` : null;
  return notifyMany(ids, {
    type: 'TICKET_ASSIGNMENT_APPROVED',
    title: 'Ticket approved, you can start',
    message: `${approverName ? `${approverName}, the department head, approved` : 'The department head approved'} "${ticket.title}". The team can work on it now.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketProgress = async (ticket: { _id: string; title: string; userId?: string | null; assigneeId?: string | null }, remark: string, actorId: string) => {
  const raiserId = ticket.userId?.toString();
  if (!raiserId || raiserId === actorId) return [];
  const [actor] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, actorId)).limit(1);
  const short = remark.length > 120 ? `${remark.slice(0, 117)}...` : remark;
  return notifyMany([raiserId], {
    type: 'TICKET_PROGRESS',
    title: 'Progress update',
    message: `${actor?.firstName ?? 'The assignee'} on "${ticket.title}": ${short}`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketDeclined = async (ticket: { _id: string; title: string; userId: string; assigneeId?: string | null }, reason: string, actorId: string) => {
  const recipientIds = [ticket.userId?.toString(), ticket.assigneeId?.toString()].filter((id): id is string => !!id && id !== actorId);
  return notifyMany(recipientIds, {
    type: 'TICKET_DECLINED',
    title: 'Ticket declined',
    message: `"${ticket.title}" was declined by the department: ${reason}`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketUnassigned = async (ticket: { _id: string; title: string; departmentId?: string | null }, actorId: string) => {
  let recipientIds: string[] = [];
  if (ticket.departmentId) {
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
    recipientIds = heads.map((h) => h.id);
  }
  if (!recipientIds.length) recipientIds = await activeVerifierIds();
  recipientIds = recipientIds.filter((id) => id !== actorId);

  return notifyMany(recipientIds, {
    type: 'TICKET_ASSIGNED',
    title: 'New ticket needs a person',
    message: `"${ticket.title}" was raised and nobody is working it yet. Pick someone for it.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketOnHold = async (entity: VerifiableEntity, remark: string, actorId: string, kind: 'TICKET' | 'TASK' = 'TICKET') => {
  const recipientIds: string[] = [];
  if (entity.assigneeId && entity.assigneeId.toString() !== actorId) recipientIds.push(entity.assigneeId.toString());
  if (entity.userId && entity.userId.toString() !== actorId && entity.userId.toString() !== entity.assigneeId?.toString()) {
    recipientIds.push(entity.userId.toString());
  }
  if (!recipientIds.length) return [];

  const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
  return notifyMany(recipientIds, {
    type: `${kind}_ON_HOLD`,
    title: kind === 'TICKET' ? 'Ticket put on hold' : 'Delegation put on hold',
    message: `"${entity.title}" was put on hold: ${remark}`,
    ...idField,
  });
}

export const notifyTicketDueSoon = async (ticket: { _id: string; title: string; assigneeId?: string | null; departmentId?: string | null; minutesLeft: number; dueAt: string }) => {
  let recipientIds: string[] = ticket.assigneeId ? [ticket.assigneeId] : [];
  if (!recipientIds.length && ticket.departmentId) {
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId), eq(users.isActive, true)));
    recipientIds = heads.map((h) => h.id);
  }
  return notifyMany(recipientIds, {
    type: 'TICKET_DUE_SOON',
    title: 'Ticket due soon',
    message: `"${ticket.title}" is due at ${ticket.dueAt}, in about ${ticket.minutesLeft} min.`,
    ticketId: ticket._id,
  });
}

export const notifyTicketOverdue = async (ticket: { _id: string; title: string; assigneeId?: string | null; departmentId?: string | null }) => {
  const recipientIds: string[] = ticket.assigneeId ? [ticket.assigneeId] : [];
  if (!ticket.assigneeId && ticket.departmentId) {
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId), eq(users.isActive, true)));
    recipientIds.push(...heads.map((h) => h.id));
  }
  return notifyMany(recipientIds, {
    type: 'TICKET_OVERDUE',
    title: 'Ticket overdue',
    message: `"${ticket.title}" has passed its due time. Finish it or tell the reviewer why it is late.`,
    ticketId: ticket._id,
  });
}
