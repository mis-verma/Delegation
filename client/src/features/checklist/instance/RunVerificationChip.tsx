import { memo } from 'react';
import { ApprovalStatusChip } from '../../../components';
import { getInstanceView } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

export const RunVerificationChip = memo(function RunVerificationChip({
  instance,
  className,
}: {
  instance: ChecklistInstance;
  className?: string;
}) {
  const { verification, isComplete } = getInstanceView(instance);
  const statusKey =
    isComplete && (instance.verificationStatus === 'NOT_SUBMITTED' || instance.verificationStatus === 'REJECTED')
      ? 'READY_TO_SUBMIT'
      : instance.verificationStatus;

  return (
    <ApprovalStatusChip
      status={statusKey}
      label={verification.label}
      icon={verification.icon}
      className={className}
    />
  );
});

RunVerificationChip.displayName = 'RunVerificationChip';
