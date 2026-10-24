import { db } from '../../config/db.js';
import { notifications } from '../../db/schema/core.js';
import { checklistInstances } from '../../db/schema/index.js';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { closedFromPastDayExpr, missedInstanceIds } from '../checklistInstances/checklistMissedRun.js';
import { AppError } from '../../utils/AppError.js';
import { FILLABLE_NOTICE_TYPES } from './notificationCore.js';

export const listForUser = async (userId: string, role?: string) => {
  const canWorkClosed = role === 'ADMIN' || role === 'PC';
  const stillFillable = canWorkClosed
    ? undefined
    : sql`NOT (${notifications.type} IN (${sql.join(FILLABLE_NOTICE_TYPES.map((t) => sql`${t}`), sql`, `)}) AND IFNULL(${notifications.checklistInstanceId} IN (SELECT ${checklistInstances.id} FROM ${checklistInstances} WHERE ${closedFromPastDayExpr}), 0))`;
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), stillFillable))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const missed = await missedInstanceIds(rows.map((r) => r.checklistInstanceId).filter((id): id is string => !!id));
  return rows.map((r) => ({ ...r, checklistMissed: !!r.checklistInstanceId && missed.has(r.checklistInstanceId) }));
}

export const markRead = async (id: string, userId: string) => {
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
}

export const markUnread = async (userId: string, ids: string[]) => {
  if (!ids.length) return;
  await db
    .update(notifications)
    .set({ isRead: false, updatedAt: new Date() })
    .where(and(eq(notifications.recipientId, userId), inArray(notifications.id, ids)));
}

export const markAllRead = async (userId: string) => {
  await db
    .update(notifications)
    .set({ isRead: true, updatedAt: new Date() })
    .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false)));
}
