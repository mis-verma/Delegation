import cron from 'node-cron';
import { and, asc, eq, ne, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { tasks, taskAdditionalAssignees, users } from '../db/schema/index.js';
import { notificationService } from '../modules/notifications/notification.service.js';
import { sendMail } from '../config/mailer.js';
import { settingsService } from '../modules/settings/settings.service.js';

// Caps how many due reminders get processed in a single 5-minute tick, same rationale as
// slaSweep.job.ts's batch cap. Ordered soonest-due-first so, if the cap is ever hit, the most
// urgent reminders fire first and the remainder is picked up on the next tick.
const REMINDER_BATCH_SIZE = 500;

// Mirrors slaSweep.job.ts's shape: a recurring background sweep, since nothing else would ever
// check "is it time to remind someone about this deadline" — nobody has to be looking at the
// task for the reminder to fire.
export const startTaskDeadlineReminder = () => {
  // node-cron fires on its timer regardless of whether the previous tick's callback has resolved
  // — `reminderSentAt` is only stamped in one bulk UPDATE at the very end, after every recipient's
  // been notified/emailed, so a slow run (large batch, slow SMTP) that's still going when the next
  // 5-minute tick fires would have that tick re-SELECT the same still-unmarked tasks and send
  // duplicate reminders before the first tick's UPDATE lands. This flag makes the two ticks
  // mutually exclusive instead.
  let isRunning = false;

  cron.schedule('*/5 * * * *', async () => {
    if (isRunning) {
      console.warn('Task deadline reminder: previous run still in progress, skipping this tick.');
      return;
    }
    if (!settingsService.getCached().notifyTaskDeadlineReminders) return;
    isRunning = true;
    try {
      const now = new Date();

      // Only tasks that asked for a reminder, haven't already gotten one, aren't already finished
      // (a done task has nothing left to be reminded about), and whose reminder is actually due
      // now — pushed into the WHERE clause (dueDate <= now + reminderMinutesBefore) instead of
      // fetching every reminder-enabled task in the system and filtering in JS, so a task whose
      // reminder doesn't fire for weeks isn't loaded into memory on every single tick.
      const due = await db.select().from(tasks).where(and(
        isNull(tasks.deletedAt),
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

      // additionalAssigneeIds used to be an embedded array on the Task document; it's a junction
      // table now (TaskAdditionalAssignee) — batch-fetch every due task's additional assignees in
      // one query instead of one per task.
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
          // No SMS gateway is configured in this app (no Twilio/MSG91 keys in env.ts) — fall back
          // to the in-app notification below rather than silently dropping the reminder.
          console.warn(`Task deadline reminder: SMS channel requested for task ${task.id} but no SMS provider is configured — falling back to in-app notification.`);
        }

        // 'notification' and 'alarm' both surface in-app/over-socket; 'alarm' gets a distinct type
        // so the client can eventually give it a louder treatment (sound/persistent modal). Email
        // and the sms-fallback case also get this so there's always a record in the notification
        // center even when the other channel succeeds or isn't configured.
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
