import { IconChip } from '../../../components';
import { getInstanceView } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

export const RunVerificationChip = ({ instance }: { instance: ChecklistInstance }) => {
  const { verification } = getInstanceView(instance);
  return <IconChip icon={verification.icon} tone={verification.tone} label={verification.label} />;
};
