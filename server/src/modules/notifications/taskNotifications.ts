import { db } from '../../config/db.js';
import { users } from '../../db/schema/core.js';
import { eq, and, inArray } from 'drizzle-orm';
import { notifyMany, activeVerifierIds, activeEscalationIds } from './notificationCore.js';

export const notifyTaskAwaitingHead = async (task: { _id: string; title: string; departmentId?: string | null; userId?: string | null }) => {
  if (!task.departmentId) return [];
  const raiserId = task.userId ? task.userId.toString() : null;
  const heads = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, task.departmentId.toString()), eq(users.isActive, true)));
  return notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
    type: 'TASK_AWAITING_HEAD',
    title: 'New delegation needs your approval',
    message: `"${task.title}" was given to your department. Approve it first, then the team can start.`,
    taskId: task._id.toString(),
  });
}

export const notifyTaskHeadDecisionReminder = async (task: { _id: string; title: string; departmentId?: string | null; userId?: string | null }, hoursWaiting: number) => {
  if (!task.departmentId) return [];
  const raiserId = task.userId ? task.userId.toString() : null;
  const heads = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['MANAGER', 'SENIOR']), eq(users.departmentId, task.departmentId.toString()), eq(users.isActive, true)));
  return notifyMany(heads.map((h) => h.id).filter((id) => id !== raiserId), {
    type: 'TASK_AWAITING_HEAD_REMINDER',
    title: 'A delegation is waiting for your decision',
    message: `"${task.title}" has waited ${hoursWaiting} hours. Nobody can start until you approve or decline it.`,
    taskId: task._id.toString(),
  });
}

export const notifyTaskHeadDecisionEscalation = async (task: { _id: string; title: string }, hoursWaiting: number) => {
  return notifyMany(await activeEscalationIds(), {
    type: 'TASK_AWAITING_HEAD_ESCALATION',
    title: 'Department head has not decided',
    message: `"${task.title}" has waited ${hoursWaiting} hours for the department head. You can approve or decline it now.`,
    taskId: task._id.toString(),
  });
}

export const notifyTaskHeadApproved = async (task: { _id: string; title: string; userId?: string | null; assigneeId?: string | null; additionalAssigneeIds?: string[] }, actorId: string) => {
  const ids = [task.assigneeId?.toString(), task.userId?.toString(), ...(task.additionalAssigneeIds ?? []).map((id) => id.toString())].filter((id): id is string => !!id && id !== actorId);
  const [approver] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, actorId)).limit(1);
  const approverName = approver ? `${approver.firstName}${approver.lastName ? ` ${approver.lastName}` : ''}` : null;
  return notifyMany(ids, {
    type: 'TASK_ASSIGNMENT_APPROVED',
    title: 'Delegation approved, you can start',
    message: `${approverName ? `${approverName}, the department head, approved` : 'The department head approved'} "${task.title}". The team can work on it now.`,
    taskId: task._id.toString(),
  });
}

export const notifyTaskDeclined = async (task: { _id: string; title: string; userId: string; assigneeId?: string | null; additionalAssigneeIds?: string[] }, reason: string, actorId: string) => {
  const recipientIds = [task.userId?.toString(), task.assigneeId?.toString(), ...(task.additionalAssigneeIds ?? []).map((id) => id.toString())].filter((id): id is string => !!id && id !== actorId);
  return notifyMany(recipientIds, {
    type: 'TASK_DECLINED',
    title: 'Delegation declined',
    message: `"${task.title}" was declined by the department: ${reason}`,
    taskId: task._id.toString(),
  });
}

export const notifyTaskAssigned = async (task: { _id: string; title: string; userId: string; assigneeId?: string | null; additionalAssigneeIds?: string[] }) => {
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

  return notifyMany(recipientIds, {
    type: 'TASK_ASSIGNED',
    title: 'New delegation assigned',
    message: `${creatorName} assigned you a new delegation: "${task.title}". Kindly review.`,
    taskId: task._id.toString(),
  });
}

export const notifyTaskUnassigned = async (task: { _id: string; title: string; departmentId?: string | null }, actorId: string) => {
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

  return notifyMany(recipientIds, {
    type: 'TASK_ASSIGNED',
    title: 'New delegation needs a person',
    message: `"${task.title}" was raised and nobody is working on it yet. Pick someone for it.`,
    taskId: task._id,
  });
}

export const notifyTaskOverdue = async (task: { _id: string; title: string; assigneeIds: string[]; creatorId?: string | null }) => {
  return notifyMany([...task.assigneeIds, ...(task.creatorId ? [task.creatorId] : [])], {
    type: 'TASK_OVERDUE',
    title: 'Delegation overdue',
    message: `"${task.title}" has passed its due time and is not handed in yet.`,
    taskId: task._id,
  });
}

export const notifyTaskDueSoon = async (task: { _id: string; title: string; assigneeIds: string[]; minutesLeft: number; dueAt: string }) => {
  return notifyMany(task.assigneeIds, {
    type: 'TASK_DUE_SOON',
    title: 'Delegation due soon',
    message: `"${task.title}" is due at ${task.dueAt}, in about ${task.minutesLeft} min.`,
    taskId: task._id,
  });
}
