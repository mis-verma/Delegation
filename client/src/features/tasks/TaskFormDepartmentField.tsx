import { Combobox } from '../../components';
import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from './taskFormFieldStyles';
import type { Department } from '../../api/departments';

interface TaskFormDepartmentFieldProps {
  value: string;
  onChange: (value: string) => void;
  departments?: Department[];
  isLoading: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
  triggerClassName?: string;
}

export const TaskFormDepartmentField = ({ value, onChange, departments, isLoading, disabled = false, hideLabel = false, triggerClassName }: TaskFormDepartmentFieldProps) => (
  <div className={`group/field flex flex-col justify-end gap-1.5 ${FIELD_CARD_CLASS}`}>
    {!hideLabel && (
      <label className={FIELD_LABEL_CLASS}>
        Department
      </label>
    )}
    <Combobox
      value={value}
      onChange={onChange}
      isLoading={isLoading}
      disabled={disabled}
      placeholder="Search departments..."
      emptyOptionLabel="No department"
      options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
      className={triggerClassName}
    />
  </div>
);