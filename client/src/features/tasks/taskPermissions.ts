import type { Role } from '../../api/auth';
import type { Task } from '../../api/task';
import { taskAssigneeIds } from './cardFields';

type Viewer = { id: string; role: Role; departmentId?: string | null } | null | undefined;

const isHeadOfTaskDepartment = (task: Task, user: Viewer): boolean =>
  (user?.role === 'MANAGER' || user?.role === 'SENIOR') && !!user.departmentId && task.departmentId === user.departmentId;

const canMutateTask = (task: Task, user: Viewer): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'PC' || user.role === 'APPROVAL_MANAGER') return false;
  return task.userId === user.id || taskAssigneeIds(task).includes(user.id);
};

const statusFrozen = (task: Task, user: Viewer): boolean =>
  !!task.declinedAt || (!!task.awaitingHeadApproval && user?.role !== 'ADMIN');

export const canMoveTask = (task: Task, user: Viewer): boolean =>
  canMutateTask(task, user) && (task.status !== 'done' || user?.role === 'ADMIN') && !statusFrozen(task, user);

export const viewOnlyReason = (task: Task, user: Viewer): string | null => {
  if (!user || canEditTaskContent(task, user)) return null;
  if (user.role === 'PC') return 'PC reviews delegations from the approval queue.';
  if (user.role === 'APPROVAL_MANAGER') return 'Approval managers review delegations from the approval queue.';
  if (task.declinedAt) return 'This delegation was declined. The department head can reopen it.';
  if (task.status === 'done' && user.role !== 'ADMIN') return 'This delegation is approved and closed. Only an admin can change it.';
  if (isHeadOfTaskDepartment(task, user) && !canMutateTask(task, user)) return 'You can choose who does this delegation. Only the person who raised it can change the other details.';
  if (!canMutateTask(task, user)) return "You can see this delegation, but you are not on it, so you can't change it.";
  return 'Only the person who raised this can change the details. You can move the status and add files.';
};

export const canAssignTask = (task: Task, user: Viewer): boolean => {
  if (!user || task.declinedAt || task.status === 'draft') return false;
  if (task.status === 'done' && user.role !== 'ADMIN') return false;
  return canEditTaskContent(task, user) || isHeadOfTaskDepartment(task, user);
};

export const canEditTaskContent = (task: Task, user: Viewer): boolean => {
  if (!user || !canMutateTask(task, user) || (task.status === 'done' && user.role !== 'ADMIN')) return false;
  if (user.role !== 'USER' && user.role !== 'AGENT') return true;
  const isCreator = task.userId === user.id;
  const isAssignee = taskAssigneeIds(task).includes(user.id);
  return isCreator && (task.status === 'draft' || !isAssignee);
};
