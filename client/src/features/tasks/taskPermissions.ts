import type { Role } from '../../api/auth';
import type { Task } from '../../api/task';
import { taskAssigneeIds } from './cardFields';

type Viewer = { id: string; role: Role } | null | undefined;

/**
 * Who may change a delegation at all, status included. Mirrors the server's update() gate
 * (buildMutationCondition in task.service.ts):
 * - Admin: anything.
 * - PC and Approval Manager: nothing here; they act through the verification queue only.
 * - Everyone else, Manager included: only what they raised or are on (primary or additional
 *   assignee). A Manager can see their whole department, but seeing a colleague's delegation is not
 *   the same as being allowed to change it.
 */
export const canMutateTask = (task: Task, user: Viewer): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'PC' || user.role === 'APPROVAL_MANAGER') return false;
  return task.userId === user.id || taskAssigneeIds(task).includes(user.id);
};

/**
 * May this person move the delegation to another status (drag, "Move to", the detail sheet's
 * buttons)? An approved delegation is closed: only an Admin may reopen it.
 */
export const canMoveTask = (task: Task, user: Viewer): boolean =>
  canMutateTask(task, user) && (task.status !== 'done' || user?.role === 'ADMIN');

/**
 * May this person change the delegation's content: title, description, priority, dates, labels,
 * people. On top of canMoveTask's rules, front-line staff (User, Agent) edit only what they raised
 * for someone else, or their own draft, so the person doing the work can't move their own due date
 * (assertFrontLineCanEdit in task.service.ts). After approval only an Admin edits anything.
 */
/**
 * Why the detail sheet is read-only (fully or in part) for this person, in plain words, or null when
 * they can edit it. Same rules as canMutateTask / canMoveTask / canEditTaskContent, in that order.
 */
export const viewOnlyReason = (task: Task, user: Viewer): string | null => {
  if (!user || canEditTaskContent(task, user)) return null;
  if (user.role === 'PC') return 'PC reviews delegations from the approval queue.';
  if (user.role === 'APPROVAL_MANAGER') return 'Approval managers review delegations from the approval queue.';
  if (task.status === 'done' && user.role !== 'ADMIN') return 'This delegation is approved and closed. Only an admin can change it.';
  if (!canMutateTask(task, user)) return "You can see this delegation, but you are not on it, so you can't change it.";
  return 'Only the person who raised this can change the details. You can move the status and add files.';
};

export const canEditTaskContent = (task: Task, user: Viewer): boolean => {
  if (!canMoveTask(task, user) || !user) return false;
  if (user.role !== 'USER' && user.role !== 'AGENT') return true;
  const isCreator = task.userId === user.id;
  const isAssignee = taskAssigneeIds(task).includes(user.id);
  return isCreator && (task.status === 'draft' || !isAssignee);
};
