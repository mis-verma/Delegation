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

  async notifyPendingVerification(entity: VerifiableEntity, kind: 'TICKET' | 'TASK' = 'TICKET') {
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
    if (entity.departmentId) {
      const heads = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'MANAGER'), eq(users.departmentId, entity.departmentId.toString()), eq(users.isActive, true)));
      recipientIds.push(...heads.map((h) => h.id));
    }
    if (!recipientIds.length) recipientIds = await activeVerifierIds();

    const workers = new Set([entity.assigneeId, ...(entity.additionalAssigneeIds ?? [])].filter(Boolean).map((id) => id.toString()));
    recipientIds = recipientIds.filter((id) => !workers.has(id));
    if (!recipientIds.length) return [];

    const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_PENDING_VERIFICATION`,
      title: kind === 'TICKET' ? 'Ticket awaiting verification' : 'Delegation awaiting verification',
      message: `"${entity.title}" is ready for your review.`,
      ...idField,
    });
  },

  async notifyVerificationResult(entity: VerifiableEntity, action: 'APPROVE' | 'REJECT', note: string | undefined, kind: 'TICKET' | 'TASK' = 'TICKET') {
    const recipientIds: string[] = [];
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

  async notifyChecklistOverdue(instance: VerifiableChecklistInstance & { closed?: boolean }) {
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
          message: `"${instance.title}" is overdue. Fill it in as soon as you can.`,
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
