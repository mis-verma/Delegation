import { scheduleJob } from '../utils/jobTracker.js';
import { and, asc, eq, ne, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { tasks, taskAdditionalAssignees, users } from '../db/schema/index.js';
import { notificationService } from '../modules/notifications/notification.service.js';
import { sendMail } from '../config/mailer.js';
import { settingsService } from '../modules/settings/settings.service.js';

const REMINDER_BATCH_SIZE = 500;

export const startTaskDeadlineReminder = () => {
  let isRunning = false;

  scheduleJob("task-deadline-reminder", '*/5 * * * *', 5, async () => {
    if (isRunning) {
      console.warn('Task deadline reminder: previous run still in progress, skipping this tick.');
      return;
    }
    if (!settingsService.getCached().notifyTaskDeadlineReminders) return;
    isRunning = true;
    try {
      const now = new Date();

      const due = await db.select().from(tasks).where(and(
        isNull(tasks.deletedAt),
        eq(tasks.awaitingHeadApproval, false),
        isNotNull(tasks.dueDate),
        isNotNull(tasks.reminderMinutesBefore),
        isNull(tasks.reminderSentAt),
        ne(tasks.status, 'done'),
        sql`${tasks.dueDate} <= DATE_ADD(${now}, INTERVAL ${tasks.reminderMinutesBefore} MINUTE)`,
      )).orderBy(asc(tasks.dueDate)).limit(REMINDER_BATCH_SIZE);

      if (!due.length) return;

      if (due.length === REMINDER_BATCH_SIZE) {
        console.warn(`Task deadline reminder: hit the ${REMINDER_BATCH_SIZE}-task batch cap — there may be more due reminders still waiting; they'll be picked up on the next tick.`);
      }

      const dueTaskIds = due.map((task) => task.id);
      const additionalAssigneeRows = await db.select({ taskId: taskAdditionalAssignees.taskId, userId: taskAdditionalAssignees.userId })
        .from(taskAdditionalAssignees)
        .where(inArray(taskAdditionalAssignees.taskId, dueTaskIds));
      const additionalAssigneeIdsByTask = new Map<string, string[]>();
      for (const row of additionalAssigneeRows) {
        const list = additionalAssigneeIdsByTask.get(row.taskId) ?? [];
        list.push(row.userId);
        additionalAssigneeIdsByTask.set(row.taskId, list);
      }

      for (const task of due) {
        const recipientIds: string[] = [];
        if (task.assigneeId) recipientIds.push(task.assigneeId);
        recipientIds.push(...(additionalAssigneeIdsByTask.get(task.id) ?? []));
        if (task.userId && task.userId !== task.assigneeId) {
            recipientIds.push(task.userId);
        }
        if (!recipientIds.length) continue;

        const uniqueRecipientIds = [...new Set(recipientIds)];
        const channel = task.reminderChannel ?? 'notification';
        const title = 'Task deadline approaching';
        const message = `"${task.title}" is due ${task.dueDate!.toLocaleString()}.`;

        if (channel === 'email') {
          const recipients = await db.select({ email: users.email, firstName: users.firstName })
            .from(users)
            .where(inArray(users.id, uniqueRecipientIds));
          await Promise.all(
            recipients.map((r) =>
              sendMail({ to: r.email, subject: title, html: `<p>Hi ${r.firstName},</p><p>${message}</p>` })
                .catch((err) => console.error(`Task deadline reminder: email to ${r.email} failed:`, err)),
            ),
          );
        } else if (channel === 'sms') {
          console.warn(`Task deadline reminder: SMS channel requested for task ${task.id} but no SMS provider is configured — falling back to in-app notification.`);
        }

        await notificationService.notifyMany(uniqueRecipientIds, {
          type: channel === 'alarm' ? 'TASK_DEADLINE_ALARM' : 'TASK_DEADLINE_REMINDER',
          title,
          message,
          taskId: task.id,
        });
      }

      await db.update(tasks)
        .set({ reminderSentAt: now, updatedAt: new Date() })
        .where(inArray(tasks.id, due.map((task) => task.id)));

      console.log(`Task deadline reminder: notified for ${due.length} task(s)`);
    } catch (err) {
      console.error('Task deadline reminder sweep failed:', err);
    } finally {
      isRunning = false;
    }
  });
};
