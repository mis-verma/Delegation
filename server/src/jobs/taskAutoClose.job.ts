import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { scheduleJob } from '../utils/jobTracker.js';
import { db } from '../config/db.js';
import { tasks, taskAdditionalAssignees, taskDepartmentApprovals } from '../db/schema/index.js';
import { auditService } from '../modules/audit/audit.service.js';
import { emitTaskEvent } from '../sockets/taskEvent.js';
import { notificationService, notifySafely } from '../modules/notifications/notification.service.js';
import { dropTaskSummaries } from '../modules/tasks/taskReports.js';
import { autoCloseCutoff, autoCloseNote, dayCount } from './autoCloseRules.js';
import { configuredAutoCloseDays } from './ticketAutoClose.job.js';

const BATCH_SIZE = 200;

export const closeStaleTaskApprovals = async (now: Date = new Date(), days: number | null = configuredAutoCloseDays()): Promise<number> => {
  if (!days) return 0;
  const handedIn = sql`COALESCE(${tasks.submittedAt}, ${tasks.updatedAt})`;
  const clockStart = sql`GREATEST(${handedIn}, COALESCE(${tasks.autoCloseFrom}, ${handedIn}))`;
  const stale = await db.select().from(tasks).where(and(
    eq(tasks.status, 'pending_approval'),
    isNull(tasks.deletedAt),
    lte(clockStart, autoCloseCutoff(now, days)),
  )).orderBy(asc(clockStart)).limit(BATCH_SIZE);

  if (!stale.length) return 0;
  if (stale.length === BATCH_SIZE) {
    console.warn(`Delegation auto-close: hit the ${BATCH_SIZE}-delegation batch cap, the rest close on the next run.`);
  }

  const note = autoCloseNote(days);
  let closed = 0;
  for (const task of stale) {
    const done = await db.transaction(async (tx) => {
      const [result] = await tx.update(tasks).set({
        status: 'done',
        verifiedAt: now,
        verifiedBy: null,
        verificationNote: note,
        autoClosedAt: now,
        approvalStage: null,
        updatedAt: now,
      }).where(and(
        eq(tasks.id, task.id),
        eq(tasks.status, 'pending_approval'),
        eq(tasks.updatedAt, task.updatedAt),
        isNull(tasks.deletedAt),
      ));
      if (result.affectedRows === 0) return false;
      await tx.update(taskDepartmentApprovals)
        .set({ completionStatus: 'none' })
        .where(and(eq(taskDepartmentApprovals.taskId, task.id), eq(taskDepartmentApprovals.completionStatus, 'pending')));
      return true;
    });
    if (!done) continue;
    closed += 1;

    const [afterRow] = await db.select().from(tasks).where(eq(tasks.id, task.id)).limit(1);
    await auditService.record({
      entityType: 'Task',
      entityId: task.id,
      action: 'UPDATE',
      actorId: 'system',
      source: 'SYSTEM',
      before: task,
      after: afterRow,
    });

    emitTaskEvent('task:updated', {
      userId: task.userId,
      assigneeId: task.assigneeId ?? null,
      departmentId: task.departmentId ?? null,
    }, afterRow);

    const additionalAssigneeIds = (await db.select({ userId: taskAdditionalAssignees.userId })
      .from(taskAdditionalAssignees)
      .where(eq(taskAdditionalAssignees.taskId, task.id))).map((r) => r.userId);
    await notifySafely(() => notificationService.notifyTaskAutoClosed({
      _id: task.id,
      title: task.title,
      userId: task.userId,
      assigneeId: task.assigneeId,
      additionalAssigneeIds,
    }, days));
  }

  if (closed > 0) {
    await dropTaskSummaries();
    console.log(`Delegation auto-close: closed ${closed} delegation(s) waiting over ${dayCount(days)} for approval`);
  }
  return closed;
};

export const startTaskAutoClose = () => {
  scheduleJob('task-auto-close', '27 * * * *', 60, () => closeStaleTaskApprovals());
};
