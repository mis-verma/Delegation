import type { ChecklistInstance } from '../../api/checklistInstances';
import type { Role } from '../../api/auth';

type StageFields = Pick<ChecklistInstance, 'verificationStatus' | 'approvalStage' | 'hodApprovedAt'>;

const isHeadRole = (role: Role | undefined) => role === 'MANAGER' || role === 'SENIOR';

export const stageLabel = (run: StageFields): string | null => {
  if (run.verificationStatus !== 'PENDING_APPROVAL') return null;
  if (run.approvalStage === 'HOD') return 'With department head';
  return run.hodApprovedAt ? 'Head approved, with PC' : 'With PC';
};

export const approveLabelFor = (role: Role | undefined, run: StageFields): string =>
  run.approvalStage === 'HOD' && isHeadRole(role) ? 'Approve, send to PC' : 'Approve';
