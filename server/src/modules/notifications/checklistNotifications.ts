import { db } from '../../config/db.js';
import { users } from '../../db/schema/core.js';
import { eq, and, inArray } from 'drizzle-orm';
import { notifyMany, formatWaiting, type VerifiableChecklistInstance } from './notificationCore.js';

export const notifyChecklistPendingVerification = async (instance: VerifiableChecklistInstance) => {
  if (!instance.storeId) return [];
  const pcs = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'PC'), eq(users.storeId, instance.storeId.toString()), eq(users.isActive, true)));
  const recipientIds = pcs.map((p) => p.id);
  if (!recipientIds.length) return [];

  return notifyMany(recipientIds, {
    type: 'CHECKLIST_PENDING_VERIFICATION',
    title: 'Checklist awaiting verification',
    message: `"${instance.title}" is ready for your review.`,
    checklistInstanceId: instance._id.toString(),
  });
}

export const notifyChecklistApprovalReminder = async (instance: VerifiableChecklistInstance & { reviewerIds?: string[]; hoursWaiting: number }) => {
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

  const sent = await notifyMany(recipientIds, {
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
      await notifyMany(active.map((a) => a.id), {
        type: 'CHECKLIST_PENDING_VERIFICATION',
        title: 'Approval running late in your team',
        message: `"${instance.title}" has been waiting for approval for ${formatWaiting(instance.hoursWaiting)}.`,
        checklistInstanceId: instance._id.toString(),
      });
    }
  }
  return sent;
}

export const notifyChecklistApprovalEscalation = async (instance: VerifiableChecklistInstance & { hoursWaiting: number }) => {
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['ADMIN', 'PC', 'OWNER']), eq(users.isActive, true)));
  const recipientIds = people.map((p) => p.id);
  if (!recipientIds.length) return [];

  return notifyMany(recipientIds, {
    type: 'CHECKLIST_PENDING_VERIFICATION',
    title: 'Checklist still waiting for approval',
    message: `"${instance.title}" has been waiting for approval for ${formatWaiting(instance.hoursWaiting)} and nobody has reviewed it yet.`,
    checklistInstanceId: instance._id.toString(),
  });
}

export const notifyChecklistVerificationResult = async (instance: VerifiableChecklistInstance, action: 'APPROVE' | 'REJECT', note: string | undefined) => {
  const recipientIds = (instance.assigneeIds ?? []).map((id) => id.toString());
  if (!recipientIds.length) return [];

  const verb = action === 'APPROVE' ? 'verified' : 'sent back for changes';
  return notifyMany(recipientIds, {
    type: `CHECKLIST_${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
    title: action === 'APPROVE' ? 'Verified' : 'Sent back for changes',
    message: note ? `"${instance.title}" was ${verb}: ${note}` : `"${instance.title}" was ${verb}.`,
    checklistInstanceId: instance._id.toString(),
  });
}

export const notifyAreaManagersOfChecklistFlag = async (instance: VerifiableChecklistInstance, item: { label: string }) => {
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));
  const recipientIds = admins.map((a) => a.id);
  if (!recipientIds.length) return [];

  return notifyMany(recipientIds, {
    type: 'CHECKLIST_CONDITIONAL_FLAG',
    title: 'Checklist flagged for review',
    message: `"${item.label}" on "${instance.title}" needs attention.`,
    checklistInstanceId: instance._id.toString(),
  });
}

export const notifyChecklistOverdue = async (instance: VerifiableChecklistInstance & { closed?: boolean; fillUntil?: string }) => {
  const assigneeIds = instance.closed ? [] : (instance.assigneeIds ?? []).map((id) => id.toString());
  const pcs = instance.storeId
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'PC'), eq(users.storeId, instance.storeId.toString()), eq(users.isActive, true)))
    : [];
  const pcIds = pcs.map((p) => p.id);

  const results = [];
  if (assigneeIds.length) {
    results.push(
      ...(await notifyMany(assigneeIds, {
        type: 'CHECKLIST_OVERDUE',
        title: 'Checklist overdue',
        message: instance.fillUntil
          ? `"${instance.title}" is overdue. You can still fill it in until ${instance.fillUntil}.`
          : `"${instance.title}" is overdue. Fill it in as soon as you can.`,
        checklistInstanceId: instance._id.toString(),
      })),
    );
  }
  if (pcIds.length) {
    results.push(
      ...(await notifyMany(pcIds, {
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
}

export const notifyChecklistLateWindowClosing = async (instance: { _id: string; title: string; assigneeIds: string[]; minutesLeft: number; closesAt: string }) => {
  if (!instance.assigneeIds.length) return [];
  return notifyMany(instance.assigneeIds, {
    type: 'CHECKLIST_OVERDUE',
    title: 'Checklist closing soon',
    message: `"${instance.title}" closes at ${instance.closesAt}, about ${instance.minutesLeft} min from now. Fill it in before then.`,
    checklistInstanceId: instance._id,
  });
}

export const notifyChecklistOpened = async (instance: { _id: string; title: string; assigneeIds: string[]; closesAt: string | null }) => {
  return notifyMany(instance.assigneeIds, {
    type: 'CHECKLIST_OPENED',
    title: 'Checklist is open',
    message: instance.closesAt ? `"${instance.title}" is open now. It closes at ${instance.closesAt}.` : `"${instance.title}" is open now.`,
    checklistInstanceId: instance._id,
  });
}

export const notifyChecklistDueSoon = async (instance: { _id: string; title: string; assigneeIds: string[]; minutesLeft: number; closesAt: string }) => {
  return notifyMany(instance.assigneeIds, {
    type: 'CHECKLIST_DUE_SOON',
    title: 'Checklist closing soon',
    message: `"${instance.title}" closes at ${instance.closesAt}, in about ${instance.minutesLeft} min. Fill it in before then.`,
    checklistInstanceId: instance._id,
  });
}

export const notifyChecklistUpcoming = async (instance: { _id: string; title: string; assigneeIds: string[]; opensOn: string }) => {
  return notifyMany(instance.assigneeIds, {
    type: 'CHECKLIST_UPCOMING',
    title: 'Checklist coming up',
    message: `"${instance.title}" opens on ${instance.opensOn}. You can see it now and fill it from that day.`,
    checklistInstanceId: instance._id,
  });
}

export const notifyChecklistDraftReminder = async (instance: VerifiableChecklistInstance & { remaining: number }) => {
  const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
  if (!assigneeIds.length) return [];
  return notifyMany(assigneeIds, {
    type: 'CHECKLIST_DRAFT_REMINDER',
    title: 'Finish your checklist',
    message: `You started "${instance.title}" but haven't finished it. ${instance.remaining} item${instance.remaining === 1 ? '' : 's'} left.`,
    checklistInstanceId: instance._id.toString(),
  });
}

export const notifyChecklistSubmitReminder = async (instance: VerifiableChecklistInstance) => {
  const assigneeIds = (instance.assigneeIds ?? []).map((id) => id.toString());
  if (!assigneeIds.length) return [];
  return notifyMany(assigneeIds, {
    type: 'CHECKLIST_DRAFT_REMINDER',
    title: 'Submit your checklist',
    message: `"${instance.title}" is finished but not submitted. Submit it so it can be reviewed.`,
    checklistInstanceId: instance._id.toString(),
  });
}
