import type { ChecklistInstance } from '../../../api/checklistInstances';

type Viewer = { id: string; role: string } | null | undefined;
type WaivableRun = Pick<ChecklistInstance, 'assigneeIds' | 'verificationStatus' | 'coordinatorRun'>;

export const canWaiveRun = (user: Viewer, instance: WaivableRun): boolean => {
  if (!user) return false;
  if (instance.assigneeIds.includes(user.id)) return false;
  if (user.role === 'PC' && instance.coordinatorRun) return false;
  if (user.role === 'ADMIN' || user.role === 'PC') return true;
  return (user.role === 'MANAGER' || user.role === 'SENIOR')
    && (instance.verificationStatus === 'PENDING_APPROVAL' || instance.verificationStatus === 'REJECTED');
};
