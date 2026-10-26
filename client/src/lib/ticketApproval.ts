import type { Role } from '../api/auth';

export type ApprovalStage = 'HOD' | 'PC';

interface Approver {
  id: string;
  role: Role;
  departmentId?: string | null;
}

interface ApprovalTicket {
  departmentId: string | null;
  userId: string;
  assigneeId: string | null;
  assigneeIds?: string[];
  approvalStage?: ApprovalStage | null;
  reviewers?: { id: string }[];
  completionPendingDepartmentIds?: string[];
}

export const stageOf = (ticket: Pick<ApprovalTicket, 'approvalStage'>): ApprovalStage => ticket.approvalStage ?? 'PC';

export const isDepartmentHead = (user: Approver, ticket: Pick<ApprovalTicket, 'departmentId'>): boolean =>
  (user.role === 'MANAGER' || user.role === 'SENIOR') && !!user.departmentId && ticket.departmentId === user.departmentId;

export const canApproveTicket = (user: Approver | null | undefined, ticket: ApprovalTicket): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (ticket.assigneeId === user.id || ticket.assigneeIds?.includes(user.id)) return false;
  if (stageOf(ticket) === 'HOD') {
    if (ticket.completionPendingDepartmentIds?.length) {
      const mine = user.role === 'MANAGER' || user.role === 'SENIOR' ? user.departmentId : null;
      return !!mine && ticket.userId !== user.id && ticket.completionPendingDepartmentIds.includes(mine);
    }
    return isDepartmentHead(user, ticket) && ticket.userId !== user.id;
  }
  if (user.role === 'PC') return true;
  return !!ticket.reviewers?.some((r) => r.id === user.id);
};

export const isFinalApproval = (user: Approver | null | undefined, ticket: Pick<ApprovalTicket, 'approvalStage'>): boolean =>
  stageOf(ticket) === 'PC' || user?.role === 'ADMIN';

export const STAGE_LABEL: Record<ApprovalStage, string> = {
  HOD: 'With the department head',
  PC: 'With PC for final approval',
};

export const taskApprovalSubject = (task: {
  departmentId?: string | null;
  userId: string;
  assigneeId: string | null;
  additionalAssigneeIds?: string[];
  approvalStage?: ApprovalStage | null;
  reviewers?: { id: string }[];
  departmentApprovals?: { departmentId: string; completion: 'none' | 'pending' | 'approved' }[];
}): ApprovalTicket => ({
  departmentId: task.departmentId ?? null,
  userId: task.userId,
  assigneeId: task.assigneeId,
  assigneeIds: [...(task.assigneeId ? [task.assigneeId] : []), ...(task.additionalAssigneeIds ?? [])],
  approvalStage: task.approvalStage ?? null,
  reviewers: task.reviewers,
  completionPendingDepartmentIds: (task.departmentApprovals ?? []).filter((a) => a.completion === 'pending').map((a) => a.departmentId),
});
