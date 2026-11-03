import { DepartmentField } from '../departments/DepartmentField';
import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from './taskFormFieldStyles';
import type { Department } from '../../api/departments';

interface TaskFormDepartmentFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  multiple?: boolean;
  selectedIds?: string[];
  onChangeMany?: (ids: string[]) => void;
  departments?: Department[];
  isLoading: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
  triggerClassName?: string;
  onCreateNew?: () => void;
  peopleCount?: (departmentId: string) => number;
}

export const TaskFormDepartmentField = ({ value, onChange, multiple, selectedIds, onChangeMany, departments, isLoading, disabled = false, hideLabel = false, triggerClassName, onCreateNew, peopleCount }: TaskFormDepartmentFieldProps) => (
  <div className={`group/field flex flex-col justify-end gap-1.5 ${FIELD_CARD_CLASS}`}>
    {!hideLabel && (
      <label className={FIELD_LABEL_CLASS}>
        Department
      </label>
    )}
    <DepartmentField
      value={value}
      onChange={onChange}
      multiple={multiple}
      selectedIds={selectedIds}
      onChangeMany={onChangeMany}
      departments={departments}
      isLoading={isLoading}
      disabled={disabled}
      noneLabel="No department"
      onCreateNew={onCreateNew}
      peopleCount={peopleCount}
      className={triggerClassName}
    />
  </div>
);