import { Combobox } from '../../components';
import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from './taskFormFieldStyles';
import type { Department } from '../../api/departments';

interface TaskFormDepartmentFieldProps {
  value: string;
  onChange: (value: string) => void;
  departments?: Department[];
  isLoading: boolean;
  disabled?: boolean;
  /** Suppress the built-in "Department" label — for callers that already provide their own label
   *  next to this field (e.g. an icon-led row layout). */
  hideLabel?: boolean;
  /** Extra classes merged onto the Combobox trigger itself — for callers that need to override
   *  its default boxed/bordered look (e.g. a plain-value row layout). */
  triggerClassName?: string;
}

// gap-1.5 on the wrapper, because FIELD_LABEL_CLASS no longer carries its own mb-1.5 — that
// margin was doubling up with the `gap` every other field wrapper already set.
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