// Drizzle client + table/type definitions — replaces the old Mongoose Notification/User models.
import { db } from '../../config/db.js';
import { notifications, users } from '../../db/schema/core.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { AppError } from '../../utils/AppError.js'; // helper for creating consistent HTTP error objects (e.g. 404 Not Found)
import { getIO } from '../../sockets/socket.js'; // gives us access to the Socket.IO server so we can push notifications to the browser in real time

// Ticket/task mutations call notificationService.notify* AFTER their own write is already
// committed, with no shared transaction — the write already succeeded regardless of whether the
// notification does. Awaiting one of these bare would let a notification-insert failure (bad
// recipient row, transient DB blip) surface as a 500 for an operation that actually went through,
// risking a client retry/duplicate submission. Wrap those calls in this instead: same posture as
// taskDeadlineReminder.job.ts's per-email .catch() — log and move on, never fail the request over it.
export const notifySafely = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err) {
    console.error('Notification send failed (request already succeeded):', err);
  }
};

// Shape of the data needed to create a single notification
type CreateNotificationInput = {
  recipientId: string; // who the notification is for
  type: string; // a short machine-readable category, e.g. "TICKET_ASSIGNED"
  title: string; // short headline shown in the UI
  message: string; // the full human-readable text
  ticketId?: string; // optional link back to the related ticket, if any
  taskId?: string; // optional link back to the related task, if any
  checklistInstanceId?: string; // optional link back to the related recurring checklist instance, if any
};

// A recurring ChecklistInstance, reduced to just the fields its verification notifications need.
// Kept separate from VerifiableEntity below since it supports MULTIPLE assignees (assigneeIds)
// instead of one, and has no storeId/userId concept.
// NOTE: these input types are intentionally kept loose (`any`) — callers in task.service.ts,
// ticket.service.ts, checklistInstance.service.ts and taskDeadlineReminder.job.ts have NOT been
// migrated to Drizzle yet and still pass Mongoose documents (ObjectId fields, needing
// `.toString()`). Do not tighten these types until every caller is migrated too — the exported
// function signatures are deliberately unchanged from the Mongoose version.
type VerifiableChecklistInstance = {
  _id: any;
  title: string;
  storeId?: any;
  assigneeIds?: any[];
};

// A ticket or task, reduced to just the fields the PC-verification notifications need.
// additionalAssigneeIds only exists on Task (extra people beyond the primary assigneeId) — a
// ticket passed in here just won't have it, so it's undefined and skipped.
type VerifiableEntity = {
  _id: any;
  title: string;
  departmentId?: any;
  storeId?: any;
  userId?: any;
  assigneeId?: any;
  additionalAssigneeIds?: any[];
};

// Sends a notification to one specific user over their personal Socket.IO "room" (user:<id>),
// so if they have the app open, the notification appears instantly without needing to refresh.
const emitToUser = (userId: string, notification: unknown) => {
  getIO().to(`user:${userId}`).emit('notification:new', notification);
};

// The notification service is the in-app notification system: it creates notification records in the
// database and also pushes them live over websockets so users see them immediately.
export const notificationService = {
  // Creates the SAME notification for multiple recipients at once (e.g. notify both the assignee and their manager).
  async notifyMany(recipientIds: string[], base: Omit<CreateNotificationInput, 'recipientId'>) {
    const uniqueIds = [...new Set(recipientIds)]; // de-duplicate ids, in case the same person would receive it twice (e.g. they're both the assignee and the manager)
    if (!uniqueIds.length) return []; // nothing to do if there's no one to notify

    // Notification.id is a client-generated cuid (see src/db/schema/core.ts), not a DB
    // auto-increment column, so mysql2's `insertId` can't be used to recover it — generate
    // every row's id (and a shared timestamp) up front instead of re-selecting afterwards.
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

    // create one notification row per recipient, all sharing the same title/message/type/ticketId
    await db.insert(notifications).values(rows);
    // push each newly created notification to its owner in real time via websockets
    rows.forEach((row) => emitToUser(row.recipientId, row));
    return rows;
  },

  // Called whenever a ticket gets assigned to someone - notifies the assignee AND that department's managers/HODs,
  // so both the person doing the work and the people overseeing the department know about it.
  async notifyTicketAssigned(ticket: { _id: any; title: string; departmentId?: any; assigneeId?: any }) {
    const recipientIds: string[] = []; // will collect everyone who should be notified about this assignment

    // if the ticket has an assignee, they should definitely be told they've been assigned something
    if (ticket.assigneeId) recipientIds.push(ticket.assigneeId.toString());

    // if the ticket belongs to a department, also notify that department's managers/HODs so they stay in the loop
    if (ticket.departmentId) {
      const heads = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'MANAGER'), eq(users.departmentId, ticket.departmentId.toString())));
      recipientIds.push(...heads.map((h) => h.id));
    }

    // send the same "ticket assigned" notification to everyone we collected above
    return notificationService.notifyMany(recipientIds, {
      type: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: `Ticket "${ticket.title}" has been assigned.`,
      ticketId: ticket._id.toString(),
    });
  },

  // Called whenever a delegation (task) gets assigned to someone - notifies the assignee(s) (the
  // primary assigneeId plus any additionalAssigneeIds) so they know a new delegation is waiting on
  // them, naming who raised it. Unlike notifyTicketAssigned this doesn't also notify department
  // managers - that wasn't asked for here and tasks don't carry the same "department oversight"
  // expectation tickets do.
  async notifyTaskAssigned(task: { _id: any; title: string; userId: any; assigneeId?: any; additionalAssigneeIds?: any[] }) {
    const creatorId = task.userId.toString();
    const recipientIds = [
      ...(task.assigneeId ? [task.assigneeId.toString()] : []),
      ...(task.additionalAssigneeIds ?? []).map((id) => id.toString()),
    ].filter((id) => id !== creatorId); // no need to notify someone they assigned a delegation to themselves

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

  // Called when a ticket/task is handed off for PC verification (ticket -> PENDING_APPROVAL, task
  // -> pending_approval) - notifies every PC scoped to that department/store that something's
  // waiting on them. Mirrors notifyTicketAssigned's "look up the right people, notifyMany" shape.
  async notifyPendingVerification(entity: VerifiableEntity, kind: 'TICKET' | 'TASK' = 'TICKET') {
    const scopeConditions = [];
    if (entity.departmentId) scopeConditions.push(eq(users.departmentId, entity.departmentId.toString()));
    if (entity.storeId) scopeConditions.push(eq(users.storeId, entity.storeId.toString()));
    if (!scopeConditions.length) return []; // nothing to scope PCs by - no one to notify

    const pcs = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'PC'), or(...scopeConditions)));
    const recipientIds = pcs.map((p) => p.id);
    if (!recipientIds.length) return [];

    const idField = kind === 'TICKET' ? { ticketId: entity._id.toString() } : { taskId: entity._id.toString() };
    return notificationService.notifyMany(recipientIds, {
      type: `${kind}_PENDING_VERIFICATION`,
      title: kind === 'TICKET' ? 'Ticket awaiting verification' : 'Delegation awaiting verification',
      message: `"${entity.title}" is ready for your review.`,
      ...idField,
    });
  },

  // Called after a PC/Admin approves or rejects - tells the assignee (and the original raiser,
  // if different) the outcome, including the PC's note when there is one.
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

  // Called when a ticket is put ON_HOLD through the restricted status-update flow - tells the
  // assignee (and the original raiser, if different) it's stalled, including the remark that
  // explains why. Whoever actually made the change is excluded, since notifying yourself about
  // your own action is just noise.
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

  // Checklist-instance equivalent of notifyPendingVerification, scoped by storeId (a recurring
  // checklist instance does have one — matches notifyPendingVerification's storeId check).
  // Was comparing instance.storeId against users.departmentId (copied as-is from the old Mongoose
  // source) — two unrelated id spaces, so this never matched and PCs were never notified.
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

  // Checklist-instance equivalent of notifyVerificationResult — notifies every assignee on the
  // instance (not just one), since a recurring checklist can be shared by several people.
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

  // Fired by checklistInstance.service.ts when a Builder-authored conditional rule's
  // NOTIFY_AREA_MANAGER action triggers (e.g. "if answer is No, notify Area Manager"). The app has
  // no separate "Area Manager" role yet, so every ADMIN — the closest existing escalation contact —
  // gets notified instead of a store-specific area manager.
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

  // Fired once per instance by checklistOverdueNotifier.job.ts, the moment it crosses its
  // deadline still incomplete — notifies every assignee (the people who should have filled it
  // in) AND the store's PCs (escalation, mirroring notifyChecklistPendingVerification's PC
  // lookup), so both the person who missed it and whoever oversees that store hear about it.
  async notifyChecklistOverdue(instance: VerifiableChecklistInstance) {
    const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
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
          message: `"${instance.title}" is overdue — fill it in as soon as you can.`,
          checklistInstanceId: instance._id.toString(),
        })),
      );
    }
    if (pcIds.length) {
      results.push(
        ...(await notificationService.notifyMany(pcIds, {
          type: 'CHECKLIST_OVERDUE_ESCALATION',
          title: 'Checklist overdue',
          message: `"${instance.title}" is overdue and still hasn't been filled in.`,
          checklistInstanceId: instance._id.toString(),
        })),
      );
    }
    return results;
  },

  // Fired once per instance by checklistDraftReminder.job.ts — someone started filling this in
  // (completed at least one item) then stopped, well before the deadline. A gentler, earlier
  // nudge than notifyChecklistOverdue above: assignees only, no PC escalation, since nothing has
  // actually been missed yet.
  async notifyChecklistDraftReminder(instance: VerifiableChecklistInstance & { remaining: number }) {
    const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
    if (!assigneeIds.length) return [];
    return notificationService.notifyMany(assigneeIds, {
      type: 'CHECKLIST_DRAFT_REMINDER',
      title: 'Finish your checklist',
      message: `You started "${instance.title}" but haven't finished it — ${instance.remaining} item${instance.remaining === 1 ? '' : 's'} left.`,
      checklistInstanceId: instance._id.toString(),
    });
  },

  // Everything on the checklist is done, but nobody pressed Submit yet: one nudge to the people filling it in.
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

  // Returns the most recent 50 notifications for a given user, newest first - used to populate the notifications dropdown/list in the UI
  async listForUser(userId: string) {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  },

  // Marks a single notification as read - but only if it actually belongs to this user
  // (the { id, recipientId: userId } filter stops one user from marking someone else's notification as read)
  async markRead(id: string, userId: string) {
    const [existing] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, userId)))
      .limit(1);
    if (!existing) throw AppError.notFound('Notification not found'); // nothing matched (wrong id, or not this user's notification) -> fail with a 404

    await db
      .update(notifications)
      .set({ isRead: true, updatedAt: new Date() }) // flip the isRead flag on, so the UI stops showing it as "new"
      .where(eq(notifications.id, id));

    // No Drizzle equivalent of findOneAndUpdate's `{ new: true }` — re-select to return the
    // updated row.
    const [updated] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return updated;
  },

  // Marks EVERY unread notification belonging to this user as read in one bulk update -
  // this is what powers a "mark all as read" button, instead of the user clicking each one individually
  async markAllRead(userId: string) {
    await db
      .update(notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false)));
  },
};
