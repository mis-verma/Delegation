import { PrioritySelect } from '../../components/priorityChip';
import { PRIORITY_MAP } from './taskDisplay';
import type { Task } from '../../api/task';

const OPTIONS = (['low', 'medium', 'high'] as const).map((p) => ({ value: p, label: PRIORITY_MAP[p].label, solid: PRIORITY_MAP[p].solid, icon: PRIORITY_MAP[p].icon }));

export const TaskPriorityChipPicker = ({
  value,
  onChange,
  disabled = false,
  fullWidth = false,
  triggerClassName,
}: {
  value: Task['priority'];
  onChange: (v: Task['priority']) => void;
  disabled?: boolean;
  fullWidth?: boolean;
  triggerClassName?: string;
}) => <PrioritySelect value={value} onChange={onChange} options={OPTIONS} disabled={disabled} fullWidth={fullWidth} triggerClassName={triggerClassName} />;
