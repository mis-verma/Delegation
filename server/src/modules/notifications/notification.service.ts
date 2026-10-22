import { db } from '../../config/db.js';
import { notifications, users } from '../../db/schema/core.js';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { missedInstanceIds } from '../checklistInstances/checklistMissedRun.js';
import { AppError } from '../../utils/AppError.js';
import { getIO } from '../../sockets/socket.js';
import { pushService } from './push.service.js';

export const notifySafely = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err) {
    console.error('Notification send failed (request already succeeded):', err);
  }
};

type CreateNotificationInput = {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  ticketId?: string;
  taskId?: string;
  checklistInstanceId?: string;
};

type VerifiableChecklistInstance = {
  _id: any;
  title: string;
  storeId?: any;
  assigneeIds?: any[];
};

type VerifiableEntity = {
  _id: any;
  title: string;
  departmentId?: any;
  storeId?: any;
  userId?: any;
  assigneeId?: any;
  additionalAssigneeIds?: any[];
  reviewerIds?: string[];
};

const activeVerifierIds = async () =>
  (await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['ADMIN', 'PC']), eq(users.isActive, true)))).map((u) => u.id);

const emitToUser = (userId: string, notification: unknown) => {
  getIO().to(`user:${userId}`).emit('notification:new', notification);
};

const formatWaiting = (hours: number) => {
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const h = Math.max(1, Math.floor(hours));
  return `${h} hour${h === 1 ? '' : 's'}`;
};

export const notificationService = {
  async notifyMany(recipientIds: string[], base: Omit<CreateNotificationInput, 'recipientId'>) {
    const uniqueIds = [...new Set(recipientIds)];
    if (!uniqueIds.length) return [];

    const now = new Date();
    const rows = uniqueIds.map((recipientId) => ({
      id: createId(),
      recipientId,
      type: base.type,
      title: base.title,
      message: base.message,
      ticketId: base.ticketId ?? null,
      taskId: base.taskId ?? null,
      checklistInstanceId: base.checklistInstanceId ?? null,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(notifications).values(rows);
    rows.forEach((row) => emitToUser(row.recipientId, row));
    void pushService.deliver(rows).catch((err) => console.error('Push delivery failed', err));
    return rows;
  },

  async notifyTicketAssigned(ticket: { _id: any; title: string; departmentId?: any; assigneeId?: any }) {
    const recipientIds: string[] = [];

    const assigneeId = ticket.assigneeId ? ticket.assigneeId.toString() : null;
    if (assigneeId) recipientIds.push(assigneeId);

    const sent = await notificationService.notifyMany(recipientIds, {
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
    const toHeads = await notificationService.notifyMany(headIds, {
      type: 'TICKET_TO_DEPARTMENT',
      title: 'Ticket sent to your department',
      message: `"${ticket.title}" was assigned to someone in your department. Open it to check, reassign it, or decline it.`,
      ticketId: ticket._id.toString(),
    });
    return [...sent, ...toHeads];
  },

  async notifyTicketAwaitingHead(ticket: { _id: any; title: string; departmentId?: any; assigneeId?: any; userId?: any }) {
    if (!ticket.departmentId) return [];
    const raiserId = ticket.userId ? ticket.userId.toString() : null;
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
    return notificationService.notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
      type: 'TICKET_AWAITING_HEAD',
      title: 'New ticket needs your approval',
      message: `"${ticket.title}" was raised for your department. Approve it first, then the team can work on it.`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyHeadDecisionReminder(ticket: { _id: any; title: string; departmentId?: any; userId?: any }, hoursWaiting: number) {
    if (!ticket.departmentId) return [];
    const raiserId = ticket.userId ? ticket.userId.toString() : null;
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId.toString()), eq(users.isActive, true)));
    return notificationService.notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
      type: 'TICKET_AWAITING_HEAD_REMINDER',
      title: 'A ticket is waiting for your decision',
      message: `"${ticket.title}" has waited ${hoursWaiting} hours. Nobody can start until you approve or decline it.`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyHeadDecisionEscalation(ticket: { _id: any; title: string }, hoursWaiting: number) {
    return notificationService.notifyMany(await activeVerifierIds(), {
      type: 'TICKET_AWAITING_HEAD_ESCALATION',
      title: 'Department head has not decided',
      message: `"${ticket.title}" has waited ${hoursWaiting} hours for the department head. You can approve or decline it now.`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyTaskAwaitingHead(task: { _id: any; title: string; departmentId?: any; userId?: any }) {
    if (!task.departmentId) return [];
    const raiserId = task.userId ? task.userId.toString() : null;
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, task.departmentId.toString()), eq(users.isActive, true)));
    return notificationService.notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
      type: 'TASK_AWAITING_HEAD',
      title: 'New delegation needs your approval',
      message: `"${task.title}" was given to your department. Approve it first, then the team can start.`,
      taskId: task._id.toString(),
    });
  },

  async notifyTaskHeadDecisionReminder(task: { _id: any; title: string; departmentId?: any; userId?: any }, hoursWaiting: number) {
    if (!task.departmentId) return [];
    const raiserId = task.userId ? task.userId.toString() : null;
    const heads = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, task.departmentId.toString()), eq(users.isActive, true)));
    return notificationService.notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
      type: 'TASK_AWAITING_HEAD_REMINDER',
      title: 'A delegation is waiting for your decision',
      message: `"${task.title}" has waited ${hoursWaiting} hours. Nobody can start until you approve or decline it.`,
      taskId: task._id.toString(),
    });
  },

  async notifyTaskHeadDecisionEscalation(task: { _id: any; title: string }, hoursWaiting: number) {
    return notificationService.notifyMany(await activeVerifierIds(), {
      type: 'TASK_AWAITING_HEAD_ESCALATION',
      title: 'Department head has not decided',
      message: `"${task.title}" has waited ${hoursWaiting} hours for the department head. You can approve or decline it now.`,
      taskId: task._id.toString(),
    });
  },

  async notifyTaskHeadApproved(task: { _id: any; title: string; userId?: any; assigneeId?: any; additionalAssigneeIds?: any[] }, actorId: string) {
    const ids = [task.assigneeId?.toString(), task.userId?.toString(), ...(task.additionalAssigneeIds ?? []).map((id) => id.toString())].filter((id): id is string => !!id && id !== actorId);
    const [approver] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, actorId)).limit(1);
    const approverName = approver ? `${approver.firstName}${approver.lastName ? ` ${approver.lastName}` : ''}` : null;
    return notificationService.notifyMany(ids, {
      type: 'TASK_ASSIGNMENT_APPROVED',
      title: 'Delegation approved, you can start',
      message: `${approverName ? `${approverName}, the department head, approved` : 'The department head approved'} "${task.title}". The team can work on it now.`,
      taskId: task._id.toString(),
    });
  },

  async notifyTaskDeclined(task: { _id: any; title: string; userId: any; assigneeId?: any; additionalAssigneeIds?: any[] }, reason: string, actorId: string) {
    const recipientIds = [task.userId?.toString(), task.assigneeId?.toString(), ...(task.additionalAssigneeIds ?? []).map((id) => id.toString())].filter((id): id is string => !!id && id !== actorId);
    return notificationService.notifyMany(recipientIds, {
      type: 'TASK_DECLINED',
      title: 'Delegation declined',
      message: `"${task.title}" was declined by the department: ${reason}`,
      taskId: task._id.toString(),
    });
  },

  async notifyStaleWork(ticket: { _id: any; title: string; assigneeId?: any }, hoursQuiet: number) {
    const assigneeId = ticket.assigneeId?.toString();
    if (!assigneeId) return [];
    return notificationService.notifyMany([assigneeId], {
      type: 'TICKET_STALE_REMINDER',
      title: 'Add a quick update',
      message: `"${ticket.title}" has had no update for ${hoursQuiet} hours. Post a short note so everyone knows where it stands.`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyAdminsOfRisk(kind: string, title: string, message: string) {
    const admins = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)))).map((u) => u.id);
    return notificationService.notifyMany(admins, { type: `SYSTEM_RISK_CRITICAL_${kind}`, title, message });
  },

  async notifyBackupFailed(reason: string) {
    const admins = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)))).map((u) => u.id);
    return notificationService.notifyMany(admins, {
      type: 'SYSTEM_BACKUP_FAILED',
      title: 'Last night\'s data backup failed',
      message: reason.slice(0, 160),
    });
  },

  async notifyTicketHeadApproved(ticket: { _id: any; title: string; userId?: any; assigneeId?: any }, actorId: string) {
    const ids = [ticket.assigneeId?.toString(), ticket.userId?.toString()].filter((id): id is string => !!id && id !== actorId);
    const [approver] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, actorId)).limit(1);
    const approverName = approver ? `${approver.firstName}${approver.lastName ? ` ${approver.lastName}` : ''}` : null;
    return notificationService.notifyMany(ids, {
      type: 'TICKET_ASSIGNMENT_APPROVED',
      title: 'Ticket approved, you can start',
      message: `${approverName ? `${approverName}, the department head, approved` : 'The department head approved'} "${ticket.title}". The team can work on it now.`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyTicketProgress(ticket: { _id: any; title: string; userId?: any; assigneeId?: any }, remark: string, actorId: string) {
    const raiserId = ticket.userId?.toString();
    if (!raiserId || raiserId === actorId) return [];
    const [actor] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, actorId)).limit(1);
    const short = remark.length > 120 ? `${remark.slice(0, 117)}...` : remark;
    return notificationService.notifyMany([raiserId], {
      type: 'TICKET_PROGRESS',
      title: 'Progress update',
      message: `${actor?.firstName ?? 'The assignee'} on "${ticket.title}": ${short}`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyTicketDeclined(ticket: { _id: any; title: string; userId: any; assigneeId?: any }, reason: string, actorId: string) {
    const recipientIds = [ticket.userId?.toString(), ticket.assigneeId?.toString()].filter((id): id is string => !!id && id !== actorId);
    return notificationService.notifyMany(recipientIds, {
      type: 'TICKET_DECLINED',
      title: 'Ticket declined',
      message: `"${ticket.title}" was declined by the department: ${reason}`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyTicketUnassigned(ticket: { _id: any; title: string; departmentId?: any }, actorId: string) {
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

    return notificationService.notifyMany(recipientIds, {
      type: 'TICKET_ASSIGNED',
      title: 'New ticket needs a person',
      message: `"${ticket.title}" was raised and nobody is working it yet. Pick someone for it.`,
      ticketId: ticket._id.toString(),
    });
  },

  async notifyTaskAssigned(task: { _id: any; title: string; userId: any; assigneeId?: any; additionalAssigneeIds?: any[] }) {
    const creatorId = task.userId.toString();
    const recipientIds = [
      ...(task.assigneeId ? [task.assigneeId.toString()] : []),
      ...(task.additionalAssigneeIds ?? []).map((id) => id.toString()),
    ].filter((id) => id !== creatorId);

    if (!recipientIds.length) return [];

    const [creator] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, creatorId))
      .limit(1);
    const creatorName = creator ? `${creator.firstName} ${creator.lastName ?? ''}`.trim() : 'Someone';

    return notificationService.notifyMany(recipientIds, {
      type: 'TASK_ASSIGNED',
      title: 'New delegation assigned',
      message: `${creatorName} assigned you a new delegation: "${task.title}". Kindly review.`,
      taskId: task._id.toString(),
    });
  },

  async notifyTaskUnassigned(task: { _id: string; title: string; departmentId?: string | null }, actorId: string) {
    let recipientIds: string[] = [];
    if (task.departmentId) {
      const heads = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'MANAGER'), eq(users.departmentId, task.departmentId), eq(users.isActive, true)));
      recipientIds = heads.map((h) => h.id);
    }
    if (!recipientIds.length) recipientIds = await activeVerifierIds();
    recipientIds = recipientIds.filter((id) => id !== actorId);

    return notificationService.notifyMany(recipientIds, {
      type: 'TASK_ASSIGNED',
      title: 'New delegation needs a person',
      message: `"${task.title}" was raised and nobody is working on it yet. Pick someone for it.`,
      taskId: task._id,
    });
  },

  async notifyPendingVerification(entity: VerifiableEntity, kind: 'TICKET' | 'TASK' = 'TICKET', stage: 'HOD' | 'PC' = 'PC', waitingHours?: number) {
    const waitText = waitingHours ? `has been waiting ${waitingHours} hours for your approval` : null;
    const idFieldOf = () => (kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() });
    if (stage === 'HOD') {
      const heads = entity.departmentId
        ? await db
            .select({ id: users.id })
            .from(users)
            .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, entity.departmentId.toString()), eq(users.isActive, true)))
        : [];
      const people = new Set([entity.assigneeId, entity.userId, ...(entity.additionalAssigneeIds ?? [])].filter(Boolean).map((id) => id.toString()));
      const headIds = heads.map((h) => h.id).filter((id) => !people.has(id));
      if (headIds.length) {
        return notificationService.notifyMany(headIds, {
          type: `${kind}_PENDING_VERIFICATION`,
          title: waitText ? 'Still waiting for your approval' : kind === 'TICKET' ? 'Ticket waiting for your approval' : 'Delegation waiting for your approval',
          message: waitText ? `"${entity.title}" ${waitText}. Approve it or send it back.` : `"${entity.title}" is done. As department head you approve it first, then it goes to PC.`,
          ...idFieldOf(),
        });
      }
    }

    const scopeConditions = [];
    if (entity.departmentId) scopeConditions.push(eq(users.departmentId, entity.departmentId.toString()));
    if (entity.storeId) scopeConditions.push(eq(users.storeId, entity.storeId.toString()));

    let recipientIds: string[] = [...(entity.reviewerIds ?? [])];
    if (scopeConditions.length) {
      const pcs = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'PC'), eq(users.isActive, true), or(...scopeConditions)));
      recipientIds.push(...pcs.map((p) => p.id));
    }
    if (!recipientIds.length) recipientIds = await activeVerifierIds();

    const workers = new Set([entity.assigneeId, ...(entity.additionalAssigneeIds ?? [])].filter(Boolean).map((id) => id.toString()));
    recipientIds = recipientIds.filter((id) => !workers.has(id));
    if (!recipientIds.length) return [];

    const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_PENDING_VERIFICATION`,
      title: waitText ? 'Still waiting for your approval' : kind === 'TICKET' ? 'Ticket awaiting verification' : 'Delegation awaiting verification',
      message: waitText ? `"${entity.title}" ${waitText}. Approve it or send it back.` : entity.departmentId ? `"${entity.title}" is ready for your final approval.` : `"${entity.title}" is ready for your review.`,
      ...idField,
    });
  },

  async notifyVerificationResult(entity: VerifiableEntity, action: 'APPROVE' | 'REJECT', note: string | undefined, kind: 'TICKET' | 'TASK' = 'TICKET', extraRecipientIds: string[] = []) {
    const recipientIds: string[] = [...extraRecipientIds];
    if (entity.assigneeId) recipientIds.push(entity.assigneeId.toString());
    recipientIds.push(...(entity.additionalAssigneeIds ?? []).map((a) => a.toString()));
    if (entity.userId && entity.userId.toString() !== entity.assigneeId?.toString()) recipientIds.push(entity.userId.toString());
    if (!recipientIds.length) return [];

    const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
    const verb = action === 'APPROVE' ? 'verified and closed' : 'sent back for changes';
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
      title: action === 'APPROVE' ? 'Verified' : 'Sent back for changes',
      message: note ? `"${entity.title}" was ${verb}: ${note}` : `"${entity.title}" was ${verb}.`,
      ...idField,
    });
  },

  async notifyTicketOnHold(entity: VerifiableEntity, remark: string, actorId: string, kind: 'TICKET' | 'TASK' = 'TICKET') {
    const recipientIds: string[] = [];
    if (entity.assigneeId && entity.assigneeId.toString() !== actorId) recipientIds.push(entity.assigneeId.toString());
    if (entity.userId && entity.userId.toString() !== actorId && entity.userId.toString() !== entity.assigneeId?.toString()) {
      recipientIds.push(entity.userId.toString());
    }
    if (!recipientIds.length) return [];

    const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_ON_HOLD`,
      title: kind === 'TICKET' ? 'Ticket put on hold' : 'Delegation put on hold',
      message: `"${entity.title}" was put on hold: ${remark}`,
      ...idField,
    });
  },

  async notifyChecklistPendingVerification(instance: VerifiableChecklistInstance) {
    if (!instance.storeId) return [];
    const pcs = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'PC'), eq(users.storeId, instance.storeId.toString())));
    const recipientIds = pcs.map((p) => p.id);
    if (!recipientIds.length) return [];

    return notificationService.notifyMany(recipientIds, {
      type: 'CHECKLIST_PENDING_VERIFICATION',
      title: 'Checklist awaiting verification',
      message: `"${instance.title}" is ready for your review.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  async notifyChecklistApprovalReminder(instance: VerifiableChecklistInstance & { reviewerIds?: any[]; hoursWaiting: number }) {
    let recipientIds = (instance.reviewerIds ?? []).map((id) => id.toString());
    if (!recipientIds.length) {
      const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
      if (assigneeIds.length) {
        const rows = await db.select({ departmentId: users.departmentId }).from(users).where(inArray(users.id, assigneeIds));
        const departmentIds = [...new Set(rows.map((r) => r.departmentId).filter((d): d is string => !!d))];
        if (departmentIds.length) {
          const heads = await db
            .select({ id: users.id })
            .from(users)
            .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), inArray(users.departmentId, departmentIds), eq(users.isActive, true)));
          recipientIds.push(...heads.map((h) => h.id));
        }
      }
      if (instance.storeId) {
        const pcs = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'PC'), eq(users.storeId, instance.storeId.toString()), eq(users.isActive, true)));
        recipientIds.push(...pcs.map((p) => p.id));
      }
    }
    if (!recipientIds.length) return [];

    const sent = await notificationService.notifyMany(recipientIds, {
      type: 'CHECKLIST_PENDING_VERIFICATION',
      title: 'Checklist waiting for approval',
      message: `"${instance.title}" has been waiting for approval for ${formatWaiting(instance.hoursWaiting)}.`,
      checklistInstanceId: instance._id.toString(),
    });

    const assigneeSet = new Set((instance.assigneeIds ?? []).map((id) => id.toString()));
    const alreadyTold = new Set(recipientIds);
    const heads = await db
      .select({ superiorId: users.reportsToId })
      .from(users)
      .where(and(inArray(users.id, recipientIds), eq(users.isActive, true)));
    const superiorIds = [...new Set(heads.map((h) => h.superiorId).filter((id): id is string => !!id && !alreadyTold.has(id) && !assigneeSet.has(id)))];
    if (superiorIds.length) {
      const active = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, superiorIds), eq(users.isActive, true)));
      if (active.length) {
        await notificationService.notifyMany(active.map((a) => a.id), {
          type: 'CHECKLIST_PENDING_VERIFICATION',
          title: 'Approval running late in your team',
          message: `"${instance.title}" has been waiting for approval for ${formatWaiting(instance.hoursWaiting)}.`,
          checklistInstanceId: instance._id.toString(),
        });
      }
    }
    return sent;
  },

  async notifyChecklistApprovalEscalation(instance: VerifiableChecklistInstance & { hoursWaiting: number }) {
    const people = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['ADMIN', 'PC']), eq(users.isActive, true)));
    const recipientIds = people.map((p) => p.id);
    if (!recipientIds.length) return [];

    return notificationService.notifyMany(recipientIds, {
      type: 'CHECKLIST_PENDING_VERIFICATION',
      title: 'Checklist still waiting for approval',
      message: `"${instance.title}" has been waiting for approval for ${formatWaiting(instance.hoursWaiting)} and nobody has reviewed it yet.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  async notifyChecklistVerificationResult(instance: VerifiableChecklistInstance, action: 'APPROVE' | 'REJECT', note: string | undefined) {
    const recipientIds = (instance.assigneeIds ?? []).map((id) => id.toString());
    if (!recipientIds.length) return [];

    const verb = action === 'APPROVE' ? 'verified' : 'sent back for changes';
    return notificationService.notifyMany(recipientIds, {
      type: `CHECKLIST_${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
      title: action === 'APPROVE' ? 'Verified' : 'Sent back for changes',
      message: note ? `"${instance.title}" was ${verb}: ${note}` : `"${instance.title}" was ${verb}.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  async notifyAreaManagersOfChecklistFlag(instance: VerifiableChecklistInstance, item: { label: string }) {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'ADMIN'));
    const recipientIds = admins.map((a) => a.id);
    if (!recipientIds.length) return [];

    return notificationService.notifyMany(recipientIds, {
      type: 'CHECKLIST_CONDITIONAL_FLAG',
      title: 'Checklist flagged for review',
      message: `"${item.label}" on "${instance.title}" needs attention.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  async notifyChecklistOverdue(instance: VerifiableChecklistInstance & { closed?: boolean; fillUntil?: string }) {
    const assigneeIds = instance.closed ? [] : (instance.assigneeIds ?? []).map((id) => id.toString());
    const pcs = instance.storeId
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'PC'), eq(users.storeId, instance.storeId.toString())))
      : [];
    const pcIds = pcs.map((p) => p.id);

    const results = [];
    if (assigneeIds.length) {
      results.push(
        ...(await notificationService.notifyMany(assigneeIds, {
          type: 'CHECKLIST_OVERDUE',
          title: 'Checklist overdue',
          message: instance.fillUntil
            ? `"${instance.title}" is overdue. You can still fill it in until ${instance.fillUntil}.`
            : `"${instance.title}" is overdue. Fill it in as soon as you can.`,
          checklistInstanceId: instance._id.toString(),
        })),
      );
    }
    if (pcIds.length) {
      results.push(
        ...(await notificationService.notifyMany(pcIds, {
          type: 'CHECKLIST_OVERDUE_ESCALATION',
          title: 'Checklist overdue',
          message: instance.closed
            ? `"${instance.title}" closed without being filled in.`
            : `"${instance.title}" is overdue and still hasn't been filled in.`,
          checklistInstanceId: instance._id.toString(),
        })),
      );
    }
    return results;
  },

  async notifyChecklistLateWindowClosing(instance: { _id: string; title: string; assigneeIds: string[]; minutesLeft: number; closesAt: string }) {
    if (!instance.assigneeIds.length) return [];
    return notificationService.notifyMany(instance.assigneeIds, {
      type: 'CHECKLIST_OVERDUE',
      title: 'Checklist closing soon',
      message: `"${instance.title}" closes at ${instance.closesAt}, about ${instance.minutesLeft} min from now. Fill it in before then.`,
      checklistInstanceId: instance._id,
    });
  },

  async notifyApprovalEscalation(entity: { _id: string; title: string }, kind: 'TICKET' | 'TASK', hoursWaiting: number) {
    const recipientIds = await activeVerifierIds();
    const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_APPROVAL_ESCALATION`,
      title: 'Approval is late',
      message: `"${entity.title}" has waited ${hoursWaiting} hours for approval. Please decide or chase the reviewer.`,
      ...idField,
    });
  },

  async notifyOverdueEscalation(entity: { _id: string; title: string }, kind: 'TICKET' | 'TASK') {
    const recipientIds = await activeVerifierIds();
    const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_OVERDUE_ESCALATION`,
      title: kind === 'TICKET' ? 'Ticket overdue for a day' : 'Delegation overdue for a day',
      message: `"${entity.title}" has been overdue for more than 24 hours.`,
      ...idField,
    });
  },

  async notifyUnassignedReminder(entity: { _id: string; title: string; departmentId?: string | null }, kind: 'TICKET' | 'TASK') {
    let recipientIds: string[] = [];
    if (entity.departmentId) {
      const heads = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, entity.departmentId), eq(users.isActive, true)));
      recipientIds = heads.map((h) => h.id);
    }
    if (!recipientIds.length) recipientIds = await activeVerifierIds();
    const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_UNASSIGNED`,
      title: 'Still nobody on this',
      message: `"${entity.title}" has had nobody working on it for a day. Pick someone.`,
      ...idField,
    });
  },

  async notifyStageHandOff(entity: VerifiableEntity, kind: 'TICKET' | 'TASK', actorId: string) {
    const recipientIds = [entity.assigneeId, entity.userId, ...(entity.additionalAssigneeIds ?? [])].filter(Boolean).map((id) => id.toString()).filter((id) => id !== actorId);
    const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_HOD_APPROVED`,
      title: 'Department head approved',
      message: `"${entity.title}" was approved by the department head. It is now with PC for the final approval.`,
      ...idField,
    });
  },

  async notifyCommentAdded(entity: { _id: string; title: string; participantIds: (string | null | undefined)[] }, kind: 'TICKET' | 'TASK', authorId: string) {
    const recipientIds = entity.participantIds.filter((id): id is string => !!id && id !== authorId);
    const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_COMMENT`,
      title: 'New comment',
      message: `Someone commented on "${entity.title}".`,
      ...idField,
    });
  },

  async notifyReviewerAdded(entity: { _id: string; title: string }, kind: 'TICKET' | 'TASK', reviewerIds: string[], actorId: string) {
    const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
    return notificationService.notifyMany(reviewerIds.filter((id) => id !== actorId), {
      type: `${kind}_REVIEWER_ADDED`,
      title: 'You are a reviewer',
      message: `You were added as a reviewer on "${entity.title}". You will be asked to approve it when it is done.`,
      ...idField,
    });
  },

  async notifyStatusMoved(entity: { _id: string; title: string; raiserId: string }, kind: 'TICKET' | 'TASK', statusLabel: string, actorId: string) {
    if (entity.raiserId === actorId) return [];
    const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
    return notificationService.notifyMany([entity.raiserId], {
      type: `${kind}_STATUS`,
      title: kind === 'TICKET' ? 'Ticket moved' : 'Delegation moved',
      message: `"${entity.title}" is now ${statusLabel}.`,
      ...idField,
    });
  },

  async notifyChecklistOpened(instance: { _id: string; title: string; assigneeIds: string[]; closesAt: string | null }) {
    return notificationService.notifyMany(instance.assigneeIds, {
      type: 'CHECKLIST_OPENED',
      title: 'Checklist is open',
      message: instance.closesAt ? `"${instance.title}" is open now. It closes at ${instance.closesAt}.` : `"${instance.title}" is open now.`,
      checklistInstanceId: instance._id,
    });
  },

  async notifyTicketDueSoon(ticket: { _id: string; title: string; assigneeId?: string | null; departmentId?: string | null; minutesLeft: number; dueAt: string }) {
    let recipientIds: string[] = ticket.assigneeId ? [ticket.assigneeId] : [];
    if (!recipientIds.length && ticket.departmentId) {
      const heads = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId), eq(users.isActive, true)));
      recipientIds = heads.map((h) => h.id);
    }
    return notificationService.notifyMany(recipientIds, {
      type: 'TICKET_DUE_SOON',
      title: 'Ticket due soon',
      message: `"${ticket.title}" is due at ${ticket.dueAt}, in about ${ticket.minutesLeft} min.`,
      ticketId: ticket._id,
    });
  },

  async notifyTicketOverdue(ticket: { _id: string; title: string; assigneeId?: string | null; departmentId?: string | null }) {
    const recipientIds: string[] = ticket.assigneeId ? [ticket.assigneeId] : [];
    if (ticket.departmentId) {
      const heads = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, ticket.departmentId), eq(users.isActive, true)));
      recipientIds.push(...heads.map((h) => h.id));
    }
    return notificationService.notifyMany(recipientIds, {
      type: 'TICKET_OVERDUE',
      title: 'Ticket overdue',
      message: `"${ticket.title}" has passed its due time. Finish it or tell the reviewer why it is late.`,
      ticketId: ticket._id,
    });
  },

  async notifyTaskOverdue(task: { _id: string; title: string; assigneeIds: string[]; creatorId?: string | null }) {
    return notificationService.notifyMany([...task.assigneeIds, ...(task.creatorId ? [task.creatorId] : [])], {
      type: 'TASK_OVERDUE',
      title: 'Delegation overdue',
      message: `"${task.title}" has passed its due time and is not handed in yet.`,
      taskId: task._id,
    });
  },

  async notifyTaskDueSoon(task: { _id: string; title: string; assigneeIds: string[]; minutesLeft: number; dueAt: string }) {
    return notificationService.notifyMany(task.assigneeIds, {
      type: 'TASK_DUE_SOON',
      title: 'Delegation due soon',
      message: `"${task.title}" is due at ${task.dueAt}, in about ${task.minutesLeft} min.`,
      taskId: task._id,
    });
  },

  async notifyChecklistDueSoon(instance: { _id: string; title: string; assigneeIds: string[]; minutesLeft: number; closesAt: string }) {
    return notificationService.notifyMany(instance.assigneeIds, {
      type: 'CHECKLIST_DUE_SOON',
      title: 'Checklist closing soon',
      message: `"${instance.title}" closes at ${instance.closesAt}, in about ${instance.minutesLeft} min. Fill it in before then.`,
      checklistInstanceId: instance._id,
    });
  },

  async notifyChecklistUpcoming(instance: { _id: string; title: string; assigneeIds: string[]; opensOn: string }) {
    return notificationService.notifyMany(instance.assigneeIds, {
      type: 'CHECKLIST_UPCOMING',
      title: 'Checklist coming up',
      message: `"${instance.title}" opens on ${instance.opensOn}. You can see it now and fill it from that day.`,
      checklistInstanceId: instance._id,
    });
  },

  async notifyChecklistDraftReminder(instance: VerifiableChecklistInstance & { remaining: number }) {
    const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
    if (!assigneeIds.length) return [];
    return notificationService.notifyMany(assigneeIds, {
      type: 'CHECKLIST_DRAFT_REMINDER',
      title: 'Finish your checklist',
      message: `You started "${instance.title}" but haven't finished it. ${instance.remaining} item${instance.remaining === 1 ? '' : 's'} left.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  async notifyChecklistSubmitReminder(instance: VerifiableChecklistInstance) {
    const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
    if (!assigneeIds.length) return [];
    return notificationService.notifyMany(assigneeIds, {
      type: 'CHECKLIST_DRAFT_REMINDER',
      title: 'Submit your checklist',
      message: `"${instance.title}" is finished but not submitted. Submit it so it can be reviewed.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  async listForUser(userId: string) {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const missed = await missedInstanceIds(rows.map((r) => r.checklistInstanceId).filter((id): id is string => !!id));
    return rows.map((r) => ({ ...r, checklistMissed: !!r.checklistInstanceId && missed.has(r.checklistInstanceId) }));
  },

  async markRead(id: string, userId: string) {
    const [existing] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, userId)))
      .limit(1);
    if (!existing) throw AppError.notFound('Notification not found');

    await db
      .update(notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(eq(notifications.id, id));

    const [updated] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return updated;
  },

  async markUnread(userId: string, ids: string[]) {
    if (!ids.length) return;
    await db
      .update(notifications)
      .set({ isRead: false, updatedAt: new Date() })
      .where(and(eq(notifications.recipientId, userId), inArray(notifications.id, ids)));
  },

  async markAllRead(userId: string) {
    await db
      .update(notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false)));
  },
};
