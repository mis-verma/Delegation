import type { Role } from '../api/auth';

/**
 * Who may approve or send back a delegation or ticket that is waiting for approval. Same rule as the
 * server (assertCanVerify in task.service.ts and ticket.service.ts):
 * - Admin and PC: anything.
 * - Manager: work in their own department.
 * - Anyone named as a reviewer on that item.
 * Nobody but an Admin approves work assigned to themselves.
 */
export const canApproveWork = (
  user: { id: string; role: Role; departmentId?: string | null } | null | undefined,
  item: { departmentId: string | null; assigneeIds: string[]; reviewers?: { id: string }[] },
): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (item.assigneeIds.includes(user.id)) return false;
  if (user.role === 'PC') return true;
  if (user.role === 'MANAGER' && !!user.departmentId && item.departmentId === user.departmentId) return true;
  return !!item.reviewers?.some((r) => r.id === user.id);
};
