import type { Role } from '../../api/auth';
import type { Task } from '../../api/task';
import { isDepartmentHead } from '../../lib/ticketApproval';

type Viewer = { id: string; role: Role; departmentId?: string | null } | null | undefined;

export const canDecideOnTask = (task: Pick<Task, 'departmentId'>, user: Viewer): boolean =>
  !!user && (user.role === 'ADMIN' || user.role === 'PC' || isDepartmentHead(user, { departmentId: task.departmentId ?? null }));

export const taskFlowState = (task: Task, user: Viewer) => {
  const declined = !!task.declinedAt;
  const awaiting = !!task.awaitingHeadApproval && !declined;
  return {
    declined,
    awaiting,
    needsMyDecision: awaiting && canDecideOnTask(task, user),
    headApproved: !awaiting && !declined && !!task.assignmentApprovedAt,
  };
};

export const awaitingRequests = (tasks: readonly Task[], user: Viewer, includeAll = false): Task[] =>
  tasks
    .filter((t) => !!t.awaitingHeadApproval && !t.declinedAt && !t.deletedAt && !!user && (includeAll || canDecideOnTask(t, user)))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
