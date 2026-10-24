import type { Role } from '../../api/auth';
import type { Task } from '../../api/task';

type Viewer = { id: string; role: Role; departmentId?: string | null } | null | undefined;
type FlowTask = Pick<Task, 'departmentId' | 'departmentApprovals'>;

const headDepartmentOf = (user: Viewer): string | null =>
  user && (user.role === 'MANAGER' || user.role === 'SENIOR') && user.departmentId ? user.departmentId : null;

const isLeadership = (user: Viewer): boolean => !!user && (user.role === 'ADMIN' || user.role === 'PC');

export const canDecideOnTask = (task: FlowTask, user: Viewer): boolean => {
  if (isLeadership(user)) return true;
  const mine = headDepartmentOf(user);
  if (!mine) return false;
  return mine === task.departmentId || !!task.departmentApprovals?.some((a) => a.departmentId === mine);
};

export const canApproveTaskNow = (task: FlowTask, user: Viewer): boolean => {
  if (isLeadership(user)) return true;
  const mine = headDepartmentOf(user);
  if (!mine) return false;
  const rows = task.departmentApprovals ?? [];
  if (rows.length === 0) return mine === task.departmentId;
  return rows.some((a) => a.status === 'pending' && a.departmentId === mine);
};

export const taskFlowState = (task: Task, user: Viewer) => {
  const declined = !!task.declinedAt;
  const awaiting = !!task.awaitingHeadApproval && !declined;
  return {
    declined,
    awaiting,
    needsMyDecision: awaiting && canApproveTaskNow(task, user),
    headApproved: !awaiting && !declined && !!task.assignmentApprovedAt,
  };
};

export const awaitingRequests = (tasks: readonly Task[], user: Viewer, includeAll = false): Task[] =>
  tasks
    .filter((t) => !!t.awaitingHeadApproval && !t.declinedAt && !t.deletedAt && !!user && (includeAll || canApproveTaskNow(t, user)))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
