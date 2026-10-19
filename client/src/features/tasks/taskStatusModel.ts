import type { Task } from '../../api/task';
import { OVERDUE_EXEMPT_STATUSES } from './taskFilters';

type Status = Task['status'];

export const FORWARD_LABEL: Partial<Record<Status, string>> = {
  draft: 'Publish',
  todo: 'Start work',
  in_progress: 'Mark completed',
  on_hold: 'Resume work',
};

export const BACK_STATUS: Partial<Record<Status, Status>> = {
  in_progress: 'todo',
  pending_approval: 'in_progress',
};

export const CAN_HOLD: Status[] = ['todo', 'in_progress'];

export const BACK_LABEL: Partial<Record<Status, string>> = {
  in_progress: 'Move back to To do',
  pending_approval: 'Take back to In progress',
  done: 'Reopen',
};

export const isMoveBlocked = (from: Status, to: Status): boolean =>
  to === from
  || to === 'done'
  || (to === 'pending_approval' && from !== 'in_progress')
  || (to === 'on_hold' && !CAN_HOLD.includes(from))
  || (from === 'on_hold' && to !== 'in_progress');

export const confirmLabelFor = (from: Status, to: Status, toLabel: string): string => {
  if (to === 'on_hold') return 'Put on hold';
  if (from === 'done') return 'Reopen';
  if (BACK_STATUS[from] === to) return BACK_LABEL[from] ?? `Move to ${toLabel}`;
  return FORWARD_LABEL[from] ?? `Move to ${toLabel}`;
};

export const draftPublishProblem = (task: Task): string | null => {
  const missing: string[] = [];
  if (!task.assigneeId && !task.additionalAssigneeIds.length && !task.departmentId) missing.push('a person or a department');
  if (!task.dueDate) missing.push('a due date');
  return missing.length ? `Add ${missing.join(' and ')} before publishing.` : null;
};

export const PUBLISH_REMARK = 'Published from draft.';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const span = (ms: number): string => {
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'}`;
  const hours = Math.max(1, Math.floor(ms / HOUR_MS));
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

export interface WaitingLine {
  who: string;
  due: { text: string; overdue: boolean } | null;
}

export const waitingLine = (
  task: Task,
  now: number,
  nameOf: (id: string | null | undefined) => string | undefined,
  departmentName?: string,
): WaitingLine => {
  const assignee = nameOf(task.assigneeId) ?? 'the assignee';
  const arrived = (status: Status) =>
    (task.statusUpdates ?? []).find((u) => u.toStatus === status)?.createdAt;
  const unassigned = !task.assigneeId && !task.additionalAssigneeIds.length;
  const pickSomeone = departmentName
    ? `Waiting for the ${departmentName} manager to pick someone`
    : 'Waiting for someone to be assigned';

  let who: string;
  switch (task.status) {
    case 'draft':
      who = 'Draft, not published yet';
      break;
    case 'todo':
      who = unassigned ? pickSomeone : `Waiting for ${assignee} to start`;
      break;
    case 'in_progress':
      who = unassigned ? pickSomeone : `${assignee} is working on it`;
      break;
    case 'pending_approval': {
      const since = arrived('pending_approval');
      who = since ? `Waiting for approval for ${span(now - new Date(since).getTime())}` : 'Waiting for approval';
      break;
    }
    case 'on_hold': {
      const since = arrived('on_hold');
      who = since ? `On hold for ${span(now - new Date(since).getTime())}` : 'On hold';
      break;
    }
    default: {
      const by = nameOf(task.verifiedBy);
      who = by ? `Approved by ${by}` : 'Approved and closed';
    }
  }

  if (task.status === 'done' || !task.dueDate) return { who, due: null };
  const diff = new Date(task.dueDate).getTime() - now;
  if (diff < 0 && OVERDUE_EXEMPT_STATUSES.has(task.status)) return { who, due: null };
  return {
    who,
    due: diff < 0
      ? { text: `Delayed by ${span(-diff)}`, overdue: true }
      : { text: `Due in ${span(diff)}`, overdue: false },
  };
};
