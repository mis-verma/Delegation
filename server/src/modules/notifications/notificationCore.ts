import { db } from '../../config/db.js';
import { notifications, users } from '../../db/schema/core.js';
import { eq, and, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { getIO } from '../../sockets/socket.js';
import { pushService } from './push.service.js';

export const FILLABLE_NOTICE_TYPES = ['CHECKLIST_DUE_SOON', 'CHECKLIST_OPENED', 'CHECKLIST_UPCOMING', 'CHECKLIST_OVERDUE', 'CHECKLIST_DRAFT_REMINDER'];

export const notifySafely = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err) {
    console.error('Notification send failed (request already succeeded):', err);
  }
};

export type CreateNotificationInput = {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  ticketId?: string;
  taskId?: string;
  checklistInstanceId?: string;
};

export type VerifiableChecklistInstance = {
  _id: string;
  title: string;
  storeId?: string | null;
  assigneeIds?: string[];
};

export type VerifiableEntity = {
  _id: string;
  title: string;
  departmentId?: string | null;
  departmentIds?: string[];
  storeId?: string | null;
  userId?: string | null;
  assigneeId?: string | null;
  additionalAssigneeIds?: string[];
  reviewerIds?: string[];
};

export const activeVerifierIds = async () =>
  (await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['ADMIN', 'PC']), eq(users.isActive, true)))).map((u) => u.id);

export const activeEscalationIds = async () =>
  (await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['ADMIN', 'PC', 'OWNER']), eq(users.isActive, true)))).map((u) => u.id);

export const emitToUser = (userId: string, notification: unknown) => {
  getIO().to(`user:${userId}`).emit('notification:new', notification);
};

export const formatWaiting = (hours: number) => {
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const h = Math.max(1, Math.floor(hours));
  return `${h} hour${h === 1 ? '' : 's'}`;
};

export const notifyMany = async (recipientIds: string[], base: Omit<CreateNotificationInput, 'recipientId'>) => {
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
}
