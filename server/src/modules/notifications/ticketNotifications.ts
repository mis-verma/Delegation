import { db } from '../../config/db.js';
import { departments, notifications, users } from '../../db/schema/core.js';
import { tickets } from '../../db/schema/index.js';
import { eq, and, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { notifyMany, formatWaiting, activeVerifierIds, activeEscalationIds, type VerifiableEntity } from './notificationCore.js';

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

const HEAD_NOTICE_TYPES = ['TICKET_AWAITING_HEAD', 'TICKET_AWAITING_HEAD_REMINDER', 'TICKET_AWAITING_HEAD_ESCALATION'];

const settleHeadNotices = async (ticketId: string, deciderId: string) => {
  await db.update(notifications).set({ isRead: true }).where(and(
    eq(notifications.ticketId, ticketId),
    inArray(notifications.type, HEAD_NOTICE_TYPES),
    ne(notifications.recipientId, deciderId),
    eq(notifications.isRead, false),
  ));
};

const personLine = async (userId: string | null | undefined): Promise<string | null> => {
  if (!userId) return null;
  const [row] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, department: departments.name })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  const name = `${row.firstName}${row.lastName ? ` ${row.lastName}` : ''}`;
  return row.department ? `${name} (${row.department})` : name;
};

export const notifyAssigneeMovedTeam = async (personId: string, oldDepartmentId: string, newDepartmentId: string | null) => {
  const [open] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(
      eq(tickets.assigneeId, personId),
      eq(tickets.departmentId, oldDepartmentId),
      isNull(tickets.deletedAt),
      isNull(tickets.declinedAt),
      ne(tickets.status, 'CLOSED'),
    ));
  const count = Number(open?.count ?? 0);
  if (count === 0) return [];
  const [person, newTeam, heads] = await Promise.all([
    db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, personId)).limit(1),
    newDepartmentId ? db.select({ name: departments.name }).from(departments).where(eq(departments.id, newDepartmentId)).limit(1) : Promise.resolve([]),
    db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, oldDepartmentId), eq(users.isActive, true), ne(users.id, personId))),
  ]);
  const name = person[0] ? `${person[0].firstName}${person[0].lastName ? ` ${person[0].lastName}` : ''}` : 'Someone';
  const where = newTeam[0]?.name ? `moved to ${newTeam[0].name}` : 'left your team';
  return notifyMany(heads.map((h) => h.id), {
    type: 'TICKET_ASSIGNEE_MOVED',
    title: 'A teammate changed teams',
    message: `${name} ${where}. ${count} open ${count === 1 ? 'ticket is' : 'tickets are'} still assigned to them. Open ${count === 1 ? 'it' : 'them'} and pick someone new.`,
  });
}

export const notifyTicketRedirected = async (ticket: { _id: string; title: string; userId: string }, newDepartmentId: string, actorId: string) => {
  if (ticket.userId === actorId) return [];
  const [team, actor] = await Promise.all([
    db.select({ name: departments.name }).from(departments).where(eq(departments.id, newDepartmentId)).limit(1),
    personLine(actorId),
  ]);
  return notifyMany([ticket.userId], {
    type: 'TICKET_REDIRECTED',
    title: 'Your ticket was sent to another team',
    message: `${actor ?? 'The department head'} sent "${ticket.title}" to ${team[0]?.name ?? 'another team'}. Their head will decide next.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketAwaitingHead = async (ticket: { _id: string; title: string; departmentId?: string | null; assigneeId?: string | null; userId?: string | null }) => {
  if (!ticket.departmentId) return [];
  const raiserId = ticket.userId ? ticket.userId.toString() : null;
  const raiserLine = await personLine(raiserId);
  const heads = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
  return notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
    type: 'TICKET_AWAITING_HEAD',
    title: 'New ticket needs your approval',
    message: `${raiserLine ?? 'Someone'} sent you "${ticket.title}". Approve it and pick who does it, send it to the right team, or decline it.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyHeadDecisionReminder = async (ticket: { _id: string; title: string; departmentId?: string | null; userId?: string | null; headClaimedBy?: string | null }, hoursWaiting: number) => {
  if (!ticket.departmentId) return [];
  const raiserId = ticket.userId ? ticket.userId.toString() : null;
  const heads = ticket.headClaimedBy
    ? [{ id: ticket.headClaimedBy }]
    : await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
  return notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
    type: 'TICKET_AWAITING_HEAD_REMINDER',
    title: ticket.headClaimedBy ? 'You claimed a ticket, assign it' : 'A ticket is waiting for your decision',
    message: ticket.headClaimedBy
      ? `"${ticket.title}" has waited ${formatWaiting(hoursWaiting)}. Give it to someone in your team so work can start.`
      : `"${ticket.title}" has waited ${formatWaiting(hoursWaiting)}. Nobody can start until you claim and assign it, or decline it.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyHeadDecisionEscalation = async (ticket: { _id: string; title: string }, hoursWaiting: number) => {
  return notifyMany(await activeEscalationIds(), {
    type: 'TICKET_AWAITING_HEAD_ESCALATION',
    title: 'Department head has not decided',
    message: `"${ticket.title}" has waited ${formatWaiting(hoursWaiting)} for the department head. You can approve or decline it now.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyStaleWork = async (ticket: { _id: string; title: string; assigneeId?: string | null }, hoursQuiet: number) => {
  const assigneeId = ticket.assigneeId?.toString();
  if (!assigneeId) return [];
  return notifyMany([assigneeId], {
    type: 'TICKET_STALE_REMINDER',
    title: 'Add a quick update',
    message: `"${ticket.title}" has had no update for ${formatWaiting(hoursQuiet)}. Post a short note so everyone knows where it stands.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketHeadApproved = async (ticket: { _id: string; title: string; userId?: string | null; assigneeId?: string | null }, actorId: string, assigneeMustClaim = false) => {
  await settleHeadNotices(ticket._id.toString(), actorId);
  const ids = [assigneeMustClaim ? null : ticket.assigneeId?.toString(), ticket.userId?.toString()].filter((id): id is string => !!id && id !== actorId);
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
  await settleHeadNotices(ticket._id.toString(), actorId);
  const recipientIds = [ticket.userId?.toString(), ticket.assigneeId?.toString()].filter((id): id is string => !!id && id !== actorId);
  const declinedBy = await personLine(actorId);
  return notifyMany(recipientIds, {
    type: 'TICKET_DECLINED',
    title: 'Ticket declined',
    message: `"${ticket.title}" was declined${declinedBy ? ` by ${declinedBy}` : ' by the department'}: ${reason}`,
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

const hoursText = (hours: number | null | undefined) => {
  if (!hours) return null;
  if (hours % 24 === 0) return `${hours / 24} ${hours === 24 ? 'day' : 'days'}`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

export const notifyTicketClaimable = async (ticket: { _id: string; title: string; departmentId?: string | null; tatHours?: number | null }, actorId: string) => {
  if (!ticket.departmentId) return [];
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.departmentId, ticket.departmentId), eq(users.isActive, true), notInArray(users.role, ['MANAGER', 'SENIOR', 'OWNER'])));
  const recipientIds = people.map((p) => p.id).filter((id) => id !== actorId);
  if (!recipientIds.length) return notifyTicketUnassigned({ _id: ticket._id, title: ticket.title, departmentId: ticket.departmentId }, actorId);
  const time = hoursText(ticket.tatHours);
  return notifyMany(recipientIds, {
    type: 'TICKET_CLAIMABLE',
    title: 'New ticket to claim',
    message: `"${ticket.title}" is open in your department. Claim it if you can take it${time ? `. You get ${time} from when you claim` : ''}.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketHeadClaimed = async (ticket: { _id: string; title: string; userId: string }, headId: string) => {
  await settleHeadNotices(ticket._id.toString(), headId);
  if (ticket.userId === headId) return [];
  const head = await personLine(headId);
  return notifyMany([ticket.userId], {
    type: 'TICKET_HEAD_CLAIMED',
    title: 'Head picked up your ticket',
    message: `${head ?? 'The department head'} claimed "${ticket.title}" and will give it to someone in the team.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketGivenToClaim = async (ticket: { _id: string; title: string; assigneeId: string; tatHours?: number | null }, actorId: string) => {
  if (ticket.assigneeId === actorId) return [];
  const giver = await personLine(actorId);
  const time = hoursText(ticket.tatHours);
  return notifyMany([ticket.assigneeId], {
    type: 'TICKET_GIVEN_TO_CLAIM',
    title: 'Ticket given to you, claim it',
    message: `${giver ?? 'Your department head'} gave you "${ticket.title}". Claim it to start${time ? `. You get ${time} from when you claim` : ''}.`,
    ticketId: ticket._id.toString(),
  });
}

export const notifyTicketClaimed = async (ticket: { _id: string; title: string; userId: string; departmentId?: string | null }, claimerId: string) => {
  await db.update(notifications).set({ isRead: true }).where(and(
    eq(notifications.ticketId, ticket._id),
    eq(notifications.type, 'TICKET_CLAIMABLE'),
    ne(notifications.recipientId, claimerId),
    eq(notifications.isRead, false),
  ));
  const heads = ticket.departmentId
    ? await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId), eq(users.isActive, true)))
    : [];
  const recipientIds = [...new Set([ticket.userId, ...heads.map((h) => h.id)])].filter((id) => id !== claimerId);
  const claimer = await personLine(claimerId);
  return notifyMany(recipientIds, {
    type: 'TICKET_CLAIMED',
    title: 'Ticket claimed',
    message: `${claimer ?? 'Someone'} took "${ticket.title}". The clock has started.`,
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
