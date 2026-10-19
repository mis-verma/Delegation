import type { Role } from '../api/auth';

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
