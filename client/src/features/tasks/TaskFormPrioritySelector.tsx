import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from './taskFormFieldStyles';
import { TaskPriorityChipPicker } from './TaskPriorityChipPicker';
import type { Task } from '../../api/task';

interface TaskFormPrioritySelectorProps {
  value: Task['priority'];
  onChange: (value: Task['priority']) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}

export const TaskFormPrioritySelector = ({ value, onChange, disabled = false, hideLabel = false }: TaskFormPrioritySelectorProps) => (
  <div className={`group/field flex flex-col gap-1.5 ${FIELD_CARD_CLASS}`}>
    {!hideLabel && <span className={FIELD_LABEL_CLASS}>Priority</span>}
    <div className="flex w-full">
      <TaskPriorityChipPicker value={value} onChange={onChange} disabled={disabled} fullWidth />
    </div>
  </div>
);
