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
  onCreateNew?: () => void;
}

export const TaskFormDepartmentField = ({ value, onChange, departments, isLoading, disabled = false, hideLabel = false, triggerClassName, onCreateNew }: TaskFormDepartmentFieldProps) => (
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
      label="Department"
      emptyOptionLabel="No department"
      options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
      onCreateNew={onCreateNew}
      createNewLabel="New department"
      className={triggerClassName}
    />
  </div>
);