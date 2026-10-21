import { scheduleJob } from '../utils/jobTracker.js';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, notInArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { tickets, tasks, taskAdditionalAssignees, checklistInstances, checklistInstanceAssignees, checklistInstanceItems } from '../db/schema/index.js';
import { notificationService } from '../modules/notifications/notification.service.js';
import { settingsService } from '../modules/settings/settings.service.js';
import { deadlineExpr, localNowExpr, parentNotDeletedExpr } from '../modules/checklistInstances/checklistInstance.service.js';
import { formatClock } from '../modules/checklistDefinitions/lateWindow.js';

const BATCH = 300;
const MINUTE_MS = 60_000;
const DUE_SOON_MINUTES = 60;
const CHECKLIST_DUE_SOON_MINUTES = 30;
const OVERDUE_LOOKBACK_MS = 24 * 60 * MINUTE_MS;

const orgClock = (date: Date) => {
  const local = new Date(date.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * MINUTE_MS);
  const h = local.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(local.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const minutesUntil = (date: Date, now: Date) => Math.max(1, Math.round((date.getTime() - now.getTime()) / MINUTE_MS));

const safely = async (label: string, work: () => Promise<unknown>) => {
  try {
    await work();
  } catch (err) {
    console.error(`Due reminders (${label}) failed:`, err);
  }
};

const ticketsDueSoon = async (now: Date) => {
  const rows = await db.select().from(tickets).where(and(
    isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, false), isNull(tickets.dueSoonNotifiedAt), isNotNull(tickets.tatDueAt),
    notInArray(tickets.status, ['CLOSED', 'PENDING_APPROVAL']),
    gt(tickets.tatDueAt, now),
    lte(tickets.tatDueAt, new Date(now.getTime() + DUE_SOON_MINUTES * MINUTE_MS)),
  )).orderBy(asc(tickets.tatDueAt)).limit(BATCH);
  const done: string[] = [];
  for (const t of rows) {
    await notificationService.notifyTicketDueSoon({
      _id: t.id, title: t.title, assigneeId: t.assigneeId, departmentId: t.departmentId,
      minutesLeft: minutesUntil(t.tatDueAt!, now), dueAt: orgClock(t.tatDueAt!),
    });
    done.push(t.id);
  }
  if (done.length) await db.update(tickets).set({ dueSoonNotifiedAt: now }).where(inArray(tickets.id, done));
};

const ticketsOverdue = async (now: Date) => {
  const rows = await db.select().from(tickets).where(and(
    isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, false), isNull(tickets.overdueNotifiedAt), eq(tickets.isOverdue, true),
    notInArray(tickets.status, ['CLOSED', 'PENDING_APPROVAL']),
    gt(tickets.tatDueAt, new Date(now.getTime() - OVERDUE_LOOKBACK_MS)),
  )).orderBy(asc(tickets.tatDueAt)).limit(BATCH);
  const done: string[] = [];
  for (const t of rows) {
    await notificationService.notifyTicketOverdue({ _id: t.id, title: t.title, assigneeId: t.assigneeId, departmentId: t.departmentId });
    done.push(t.id);
  }
  if (done.length) await db.update(tickets).set({ overdueNotifiedAt: now }).where(inArray(tickets.id, done));
};

const assigneesOfTasks = async (taskIds: string[], primary: Map<string, string | null>) => {
  const extra = taskIds.length
    ? await db.select({ taskId: taskAdditionalAssignees.taskId, userId: taskAdditionalAssignees.userId }).from(taskAdditionalAssignees).where(inArray(taskAdditionalAssignees.taskId, taskIds))
    : [];
  const byTask = new Map<string, string[]>();
  for (const id of taskIds) byTask.set(id, primary.get(id) ? [primary.get(id) as string] : []);
  for (const row of extra) byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row.userId]);
  return byTask;
};

const tasksDueSoon = async (now: Date) => {
  const rows = await db.select().from(tasks).where(and(
    isNull(tasks.deletedAt), isNull(tasks.reminderMinutesBefore), isNull(tasks.reminderSentAt), isNotNull(tasks.dueDate),
    notInArray(tasks.status, ['done', 'draft', 'pending_approval']),
    gt(tasks.dueDate, now),
    lte(tasks.dueDate, new Date(now.getTime() + DUE_SOON_MINUTES * MINUTE_MS)),
  )).orderBy(asc(tasks.dueDate)).limit(BATCH);
  if (!rows.length) return;
  const people = await assigneesOfTasks(rows.map((t) => t.id), new Map(rows.map((t) => [t.id, t.assigneeId])));
  for (const t of rows) {
    await notificationService.notifyTaskDueSoon({ _id: t.id, title: t.title, assigneeIds: people.get(t.id) ?? [], minutesLeft: minutesUntil(t.dueDate!, now), dueAt: orgClock(t.dueDate!) });
  }
  await db.update(tasks).set({ reminderSentAt: now }).where(inArray(tasks.id, rows.map((t) => t.id)));
};

const tasksOverdue = async (now: Date) => {
  const rows = await db.select().from(tasks).where(and(
    isNull(tasks.deletedAt), isNull(tasks.overdueNotifiedAt), isNotNull(tasks.dueDate),
    notInArray(tasks.status, ['done', 'draft', 'pending_approval']),
    lte(tasks.dueDate, now),
    gt(tasks.dueDate, new Date(now.getTime() - OVERDUE_LOOKBACK_MS)),
  )).orderBy(asc(tasks.dueDate)).limit(BATCH);
  if (!rows.length) return;
  const people = await assigneesOfTasks(rows.map((t) => t.id), new Map(rows.map((t) => [t.id, t.assigneeId])));
  for (const t of rows) {
    await notificationService.notifyTaskOverdue({ _id: t.id, title: t.title, assigneeIds: people.get(t.id) ?? [], creatorId: t.userId });
  }
  await db.update(tasks).set({ overdueNotifiedAt: now }).where(inArray(tasks.id, rows.map((t) => t.id)));
};

const unfinishedRun = sql`(
  NOT EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id})
  OR EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 0)
)`;

const assigneesOfRuns = async (ids: string[]) => {
  const links = ids.length ? await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, ids)) : [];
  const byRun = new Map<string, string[]>();
  for (const l of links) byRun.set(l.instanceId, [...(byRun.get(l.instanceId) ?? []), l.userId]);
  return byRun;
};

const runDeadlineAt = (r: typeof checklistInstances.$inferSelect) => {
  const [h, m] = (r.cutoffTime as string).split(':').map(Number);
  const overnight = !!r.opensTime && (r.cutoffTime as string) < r.opensTime;
  return r.periodStart.getTime() + ((overnight ? 24 * 60 : 0) + h * 60 + m) * MINUTE_MS - env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * MINUTE_MS;
};

const checklistsDueSoon = async (now: Date) => {
  const rows = await db.select().from(checklistInstances).where(and(
    isNull(checklistInstances.dueSoonNotifiedAt), isNotNull(checklistInstances.cutoffTime), parentNotDeletedExpr, unfinishedRun,
    ne(checklistInstances.recurrence, 'ONE_TIME'),
    sql`${deadlineExpr} > ${localNowExpr}`,
    sql`${deadlineExpr} <= DATE_ADD(${localNowExpr}, INTERVAL ${CHECKLIST_DUE_SOON_MINUTES} MINUTE)`,
    sql`${checklistInstances.periodStart} <= DATE(${localNowExpr})`,
  )).limit(BATCH);
  if (!rows.length) return;
  const people = await assigneesOfRuns(rows.map((r) => r.id));
  for (const r of rows) {
    await notificationService.notifyChecklistDueSoon({
      _id: r.id, title: r.title, assigneeIds: people.get(r.id) ?? [],
      minutesLeft: minutesUntil(new Date(runDeadlineAt(r)), now), closesAt: formatClock(r.cutoffTime as string),
    });
  }
  await db.update(checklistInstances).set({ dueSoonNotifiedAt: now }).where(inArray(checklistInstances.id, rows.map((r) => r.id)));
};

const checklistsOpened = async (now: Date) => {
  const opensAtSql = sql`TIMESTAMP(DATE(${checklistInstances.periodStart}), CONCAT(${checklistInstances.opensTime}, ':00'))`;
  const rows = await db.select().from(checklistInstances).where(and(
    isNull(checklistInstances.openedNotifiedAt), isNotNull(checklistInstances.opensTime), parentNotDeletedExpr, unfinishedRun,
    ne(checklistInstances.recurrence, 'ONE_TIME'),
    sql`${opensAtSql} <= ${localNowExpr}`,
    sql`${opensAtSql} > DATE_SUB(${localNowExpr}, INTERVAL 2 HOUR)`,
    sql`${deadlineExpr} > ${localNowExpr}`,
  )).limit(BATCH);
  if (!rows.length) return;
  const people = await assigneesOfRuns(rows.map((r) => r.id));
  for (const r of rows) {
    await notificationService.notifyChecklistOpened({ _id: r.id, title: r.title, assigneeIds: people.get(r.id) ?? [], closesAt: r.cutoffTime ? formatClock(r.cutoffTime) : null });
  }
  await db.update(checklistInstances).set({ openedNotifiedAt: now }).where(inArray(checklistInstances.id, rows.map((r) => r.id)));
};

const checklistsUpcoming = async (now: Date) => {
  const rows = await db.select().from(checklistInstances).where(and(
    isNull(checklistInstances.upcomingNotifiedAt), parentNotDeletedExpr, ne(checklistInstances.recurrence, 'DAILY'), ne(checklistInstances.recurrence, 'ONE_TIME'),
    sql`${checklistInstances.periodStart} > DATE(${localNowExpr})`,
  )).limit(BATCH);
  if (!rows.length) return;
  const people = await assigneesOfRuns(rows.map((r) => r.id));
  for (const r of rows) {
    const opensOn = r.periodStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    await notificationService.notifyChecklistUpcoming({ _id: r.id, title: r.title, assigneeIds: people.get(r.id) ?? [], opensOn });
  }
  await db.update(checklistInstances).set({ upcomingNotifiedAt: now }).where(inArray(checklistInstances.id, rows.map((r) => r.id)));
};

const REMINDER_HOURS = 24;
const ESCALATE_HOURS = 48;
const HOUR_MS = 60 * MINUTE_MS;

const waitingSince = (r: { hodApprovedAt: Date | null; submittedAt: Date | null; updatedAt: Date }) => (r.hodApprovedAt ?? r.submittedAt ?? r.updatedAt).getTime();

const ticketApprovalChasers = async (now: Date) => {
  const pending = await db.select().from(tickets).where(and(
    isNull(tickets.deletedAt), eq(tickets.status, 'PENDING_APPROVAL'),
  )).limit(BATCH);
  for (const t of pending) {
    const hours = (now.getTime() - waitingSince(t)) / HOUR_MS;
    if (hours >= ESCALATE_HOURS && !t.approvalEscalatedAt) {
      await notificationService.notifyApprovalEscalation({ _id: t.id, title: t.title }, 'TICKET', Math.floor(hours));
      await db.update(tickets).set({ approvalEscalatedAt: now, approvalReminderSentAt: t.approvalReminderSentAt ?? now }).where(eq(tickets.id, t.id));
    } else if (hours >= REMINDER_HOURS && !t.approvalReminderSentAt) {
      await notificationService.notifyPendingVerification(
        { _id: t.id, title: t.title, departmentId: t.departmentId, storeId: t.storeId, userId: t.userId, assigneeId: t.assigneeId, reviewerIds: [] },
        'TICKET', t.approvalStage ?? 'PC', Math.floor(hours),
      );
      await db.update(tickets).set({ approvalReminderSentAt: now }).where(eq(tickets.id, t.id));
    }
  }
};

const taskApprovalChasers = async (now: Date) => {
  const pending = await db.select().from(tasks).where(and(isNull(tasks.deletedAt), eq(tasks.status, 'pending_approval'))).limit(BATCH);
  for (const t of pending) {
    const hours = (now.getTime() - waitingSince(t)) / HOUR_MS;
    if (hours >= ESCALATE_HOURS && !t.approvalEscalatedAt) {
      await notificationService.notifyApprovalEscalation({ _id: t.id, title: t.title }, 'TASK', Math.floor(hours));
      await db.update(tasks).set({ approvalEscalatedAt: now, approvalReminderSentAt: t.approvalReminderSentAt ?? now }).where(eq(tasks.id, t.id));
    } else if (hours >= REMINDER_HOURS && !t.approvalReminderSentAt) {
      await notificationService.notifyPendingVerification(
        { _id: t.id, title: t.title, departmentId: t.departmentId, userId: t.userId, assigneeId: t.assigneeId, reviewerIds: [] },
        'TASK', t.approvalStage ?? 'PC', Math.floor(hours),
      );
      await db.update(tasks).set({ approvalReminderSentAt: now }).where(eq(tasks.id, t.id));
    }
  }
};

const overdueEscalations = async (now: Date) => {
  const cutoff = new Date(now.getTime() - REMINDER_HOURS * HOUR_MS);
  const floor = new Date(now.getTime() - 72 * HOUR_MS);
  const lateTickets = await db.select().from(tickets).where(and(
    isNull(tickets.deletedAt), isNull(tickets.declinedAt), isNull(tickets.overdueEscalatedAt), eq(tickets.isOverdue, true),
    notInArray(tickets.status, ['CLOSED', 'PENDING_APPROVAL']), lte(tickets.tatDueAt, cutoff), gt(tickets.tatDueAt, floor),
  )).limit(BATCH);
  for (const t of lateTickets) await notificationService.notifyOverdueEscalation({ _id: t.id, title: t.title }, 'TICKET');
  if (lateTickets.length) await db.update(tickets).set({ overdueEscalatedAt: now }).where(inArray(tickets.id, lateTickets.map((t) => t.id)));

  const lateTasks = await db.select().from(tasks).where(and(
    isNull(tasks.deletedAt), isNull(tasks.overdueEscalatedAt), notInArray(tasks.status, ['done', 'draft', 'pending_approval']),
    isNotNull(tasks.dueDate), lte(tasks.dueDate, cutoff), gt(tasks.dueDate, floor),
  )).limit(BATCH);
  for (const t of lateTasks) await notificationService.notifyOverdueEscalation({ _id: t.id, title: t.title }, 'TASK');
  if (lateTasks.length) await db.update(tasks).set({ overdueEscalatedAt: now }).where(inArray(tasks.id, lateTasks.map((t) => t.id)));
};

const unassignedReminders = async (now: Date) => {
  const cutoff = new Date(now.getTime() - REMINDER_HOURS * HOUR_MS);
  const floor = new Date(now.getTime() - 72 * HOUR_MS);
  const openTickets = await db.select().from(tickets).where(and(
    isNull(tickets.deletedAt), isNull(tickets.declinedAt), isNull(tickets.assigneeId), isNull(tickets.unassignedNotifiedAt),
    eq(tickets.status, 'OPEN'), lte(tickets.createdAt, cutoff), gt(tickets.createdAt, floor),
  )).limit(BATCH);
  for (const t of openTickets) await notificationService.notifyUnassignedReminder({ _id: t.id, title: t.title, departmentId: t.departmentId }, 'TICKET');
  if (openTickets.length) await db.update(tickets).set({ unassignedNotifiedAt: now }).where(inArray(tickets.id, openTickets.map((t) => t.id)));

  const openTasks = await db.select().from(tasks).where(and(
    isNull(tasks.deletedAt), isNull(tasks.assigneeId), isNull(tasks.unassignedNotifiedAt),
    notInArray(tasks.status, ['done', 'draft', 'pending_approval']), lte(tasks.createdAt, cutoff), gt(tasks.createdAt, floor),
  )).limit(BATCH);
  const withHelpers = openTasks.length
    ? new Set((await db.select({ id: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees).where(inArray(taskAdditionalAssignees.taskId, openTasks.map((t) => t.id)))).map((r) => r.id))
    : new Set<string>();
  const unowned = openTasks.filter((t) => !withHelpers.has(t.id));
  for (const t of unowned) await notificationService.notifyUnassignedReminder({ _id: t.id, title: t.title, departmentId: t.departmentId }, 'TASK');
  if (unowned.length) await db.update(tasks).set({ unassignedNotifiedAt: now }).where(inArray(tasks.id, unowned.map((t) => t.id)));
};

export const startDueReminders = () => {
  let running = false;
  scheduleJob('due-reminders', '*/5 * * * *', 5, async () => {
    if (running) return;
    running = true;
    try {
      const settings = settingsService.getCached();
      const now = new Date();
      if (settings.notifyTaskDeadlineReminders) {
        await safely('tickets due soon', () => ticketsDueSoon(now));
        await safely('tickets overdue', () => ticketsOverdue(now));
        await safely('delegations due soon', () => tasksDueSoon(now));
        await safely('delegations overdue', () => tasksOverdue(now));
        await safely('overdue escalations', () => overdueEscalations(now));
        await safely('unassigned reminders', () => unassignedReminders(now));
        await safely('ticket approvals', () => ticketApprovalChasers(now));
        await safely('delegation approvals', () => taskApprovalChasers(now));
      }
      if (settings.notifyChecklistOverdueReminders) {
        await safely('checklists due soon', () => checklistsDueSoon(now));
        await safely('checklists upcoming', () => checklistsUpcoming(now));
        await safely('checklists opened', () => checklistsOpened(now));
      }
    } finally {
      running = false;
    }
  });
};
