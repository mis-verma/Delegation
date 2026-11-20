import type { ChecklistInstance } from '../../../api/checklistInstances';

type Viewer = { id: string; role: string } | null | undefined;
type WaivableRun = Pick<ChecklistInstance, 'assigneeIds' | 'verificationStatus' | 'coordinatorRun'>;
type ClosableRun = WaivableRun & Pick<ChecklistInstance, 'reviewerIds'>;

export const canWaiveRun = (user: Viewer, instance: WaivableRun): boolean => {
  if (!user) return false;
  if (instance.assigneeIds.includes(user.id)) return false;
  if (user.role === 'PC' && instance.coordinatorRun) return false;
  if (user.role === 'ADMIN' || user.role === 'PC') return true;
  return (user.role === 'MANAGER' || user.role === 'SENIOR')
    && (instance.verificationStatus === 'PENDING_APPROVAL' || instance.verificationStatus === 'REJECTED');
};

export const canCompleteAllRun = (user: Viewer, instance: ClosableRun, optedIn: boolean): boolean => {
  if (!user) return false;
  if (instance.assigneeIds.includes(user.id)) return false;
  if (instance.verificationStatus === 'APPROVED') return false;
  if (user.role === 'PC' && instance.coordinatorRun) return false;
  if (user.role === 'ADMIN' || user.role === 'PC') return true;
  return optedIn && (instance.reviewerIds.includes(user.id) || user.role === 'MANAGER' || user.role === 'SENIOR');
};

/** The person filling the checklist, closing their own remaining questions right at submit time. */
export const canSelfCompleteAllRun = (user: Viewer, instance: Pick<ChecklistInstance, 'assigneeIds' | 'verificationStatus'>): boolean => {
  if (!user) return false;
  if (user.role !== 'ADMIN' && user.role !== 'PC') return false;
  if (!instance.assigneeIds.includes(user.id)) return false;
  return instance.verificationStatus === 'NOT_SUBMITTED' || instance.verificationStatus === 'REJECTED';
};
