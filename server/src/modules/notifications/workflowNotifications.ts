import { db } from '../../config/db.js';
import { users } from '../../db/schema/core.js';
import { eq, and, or, inArray } from 'drizzle-orm';
import { notifyMany, activeVerifierIds, activeEscalationIds, type VerifiableEntity } from './notificationCore.js';

export const notifyAdminsOfRisk = async (kind: string, title: string, message: string) => {
  const admins = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)))).map((u) => u.id);
  return notifyMany(admins, { type: `SYSTEM_RISK_CRITICAL_${kind}`, title, message });
}

export const notifyBackupFailed = async (reason: string) => {
  const admins = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)))).map((u) => u.id);
  return notifyMany(admins, {
    type: 'SYSTEM_BACKUP_FAILED',
    title: 'Last night\'s data backup failed',
    message: reason.slice(0, 160),
  });
}

export const notifyPendingVerification = async (entity: VerifiableEntity, kind: 'TICKET' | 'TASK' = 'TICKET', stage: 'HOD' | 'PC' = 'PC', waitingHours?: number) => {
  const waitText = waitingHours ? `has been waiting ${waitingHours} hours for your approval` : null;
  const idFieldOf = () => (kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() });
  if (stage === 'HOD') {
    const headDepartments = entity.departmentIds?.length ? entity.departmentIds : entity.departmentId ? [entity.departmentId.toString()] : [];
    const heads = headDepartments.length
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), inArray(users.departmentId, headDepartments), eq(users.isActive, true)))
      : [];
    const people = new Set([entity.assigneeId, entity.userId, ...(entity.additionalAssigneeIds ?? [])].filter((id): id is string => Boolean(id)));
    const headIds = heads.map((h) => h.id).filter((id) => !people.has(id));
    if (headIds.length) {
      return notifyMany(headIds, {
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

  const workers = new Set([entity.assigneeId, ...(entity.additionalAssigneeIds ?? [])].filter((id): id is string => Boolean(id)));
  recipientIds = recipientIds.filter((id) => !workers.has(id));
  if (!recipientIds.length) return [];

  const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
  return notifyMany(recipientIds, {
    type: `${kind}_PENDING_VERIFICATION`,
    title: waitText ? 'Still waiting for your approval' : kind === 'TICKET' ? 'Ticket awaiting verification' : 'Delegation awaiting verification',
    message: waitText ? `"${entity.title}" ${waitText}. Approve it or send it back.` : entity.departmentId ? `"${entity.title}" is ready for your final approval.` : `"${entity.title}" is ready for your review.`,
    ...idField,
  });
}

export const notifyVerificationResult = async (entity: VerifiableEntity, action: 'APPROVE' | 'REJECT', note: string | undefined, kind: 'TICKET' | 'TASK' = 'TICKET', extraRecipientIds: string[] = []) => {
  const recipientIds: string[] = [...extraRecipientIds];
  if (entity.assigneeId) recipientIds.push(entity.assigneeId.toString());
  recipientIds.push(...(entity.additionalAssigneeIds ?? []).map((a) => a.toString()));
  if (entity.userId && entity.userId.toString() !== entity.assigneeId?.toString()) recipientIds.push(entity.userId.toString());
  if (!recipientIds.length) return [];

  const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
  const verb = action === 'APPROVE' ? 'verified and closed' : 'sent back for changes';
  return notifyMany(recipientIds, {
    type: `${kind}_${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
    title: action === 'APPROVE' ? 'Verified' : 'Sent back for changes',
    message: note ? `"${entity.title}" was ${verb}: ${note}` : `"${entity.title}" was ${verb}.`,
    ...idField,
  });
}

export const notifyApprovalEscalation = async (entity: { _id: string; title: string }, kind: 'TICKET' | 'TASK', hoursWaiting: number) => {
  const recipientIds = await activeEscalationIds();
  const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
  return notifyMany(recipientIds, {
    type: `${kind}_APPROVAL_ESCALATION`,
    title: 'Approval is late',
    message: `"${entity.title}" has waited ${hoursWaiting} hours for approval. Please decide or chase the reviewer.`,
    ...idField,
  });
}

export const notifyOverdueEscalation = async (entity: { _id: string; title: string }, kind: 'TICKET' | 'TASK') => {
  const recipientIds = await activeEscalationIds();
  const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
  return notifyMany(recipientIds, {
    type: `${kind}_OVERDUE_ESCALATION`,
    title: kind === 'TICKET' ? 'Ticket overdue for a day' : 'Delegation overdue for a day',
    message: `"${entity.title}" has been overdue for more than 24 hours.`,
    ...idField,
  });
}

export const notifyUnassignedReminder = async (entity: { _id: string; title: string; departmentId?: string | null }, kind: 'TICKET' | 'TASK') => {
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
  return notifyMany(recipientIds, {
    type: `${kind}_UNASSIGNED`,
    title: 'Still nobody on this',
    message: `"${entity.title}" has had nobody working on it for a day. Pick someone.`,
    ...idField,
  });
}

export const notifyStageHandOff = async (entity: VerifiableEntity, kind: 'TICKET' | 'TASK', actorId: string) => {
  const recipientIds = [entity.assigneeId, entity.userId, ...(entity.additionalAssigneeIds ?? [])].filter((id): id is string => Boolean(id)).filter((id) => id !== actorId);
  const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
  return notifyMany(recipientIds, {
    type: `${kind}_HOD_APPROVED`,
    title: 'Department head approved',
    message: `"${entity.title}" was approved by the department head. It is now with PC for the final approval.`,
    ...idField,
  });
}

export const notifyCompletionPartlyApproved = async (entity: VerifiableEntity, remaining: number, actorId: string) => {
  const recipientIds = [entity.assigneeId, entity.userId, ...(entity.additionalAssigneeIds ?? [])].filter((id): id is string => Boolean(id)).filter((id) => id !== actorId);
  const [approver] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, actorId)).limit(1);
  const approverName = approver ? `${approver.firstName}${approver.lastName ? ` ${approver.lastName}` : ''}` : 'A department head';
  return notifyMany(recipientIds, {
    type: 'TASK_HOD_APPROVED',
    title: 'One department head approved',
    message: `${approverName} approved "${entity.title}". Waiting for ${remaining} more department head${remaining === 1 ? '' : 's'} before it goes to PC.`,
    taskId: entity._id.toString(),
  });
}

export const notifyCommentAdded = async (entity: { _id: string; title: string; participantIds: (string | null | undefined)[] }, kind: 'TICKET' | 'TASK', authorId: string) => {
  const recipientIds = entity.participantIds.filter((id): id is string => !!id && id !== authorId);
  const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
  return notifyMany(recipientIds, {
    type: `${kind}_COMMENT`,
    title: 'New comment',
    message: `Someone commented on "${entity.title}".`,
    ...idField,
  });
}

export const notifyReviewerAdded = async (entity: { _id: string; title: string }, kind: 'TICKET' | 'TASK', reviewerIds: string[], actorId: string) => {
  const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
  return notifyMany(reviewerIds.filter((id) => id !== actorId), {
    type: `${kind}_REVIEWER_ADDED`,
    title: 'You are a reviewer',
    message: `You were added as a reviewer on "${entity.title}". You will be asked to approve it when it is done.`,
    ...idField,
  });
}

export const notifyStatusMoved = async (entity: { _id: string; title: string; raiserId: string }, kind: 'TICKET' | 'TASK', statusLabel: string, actorId: string) => {
  if (entity.raiserId === actorId) return [];
  const idField = kind === 'TICKET' ? { ticketId: entity._id } : { taskId: entity._id };
  return notifyMany([entity.raiserId], {
    type: `${kind}_STATUS`,
    title: kind === 'TICKET' ? 'Ticket moved' : 'Delegation moved',
    message: `"${entity.title}" is now ${statusLabel}.`,
    ...idField,
  });
}
