import { User } from 'lucide-react';
import { Combobox } from '../../components';
import { FIELD_LABEL_CLASS, FIELD_LABEL_ICON_CLASS } from './taskFormFieldStyles';
import type { AssignableUser } from '../../api/users';

interface TaskFormAssigneeFieldProps {
  value: string;
  onChange: (value: string) => void;
  users?: AssignableUser[];
  isLoading: boolean;
  disabled?: boolean;
}

export const TaskFormAssigneeField = ({ value, onChange, users, isLoading, disabled = false }: TaskFormAssigneeFieldProps) => (
  <div className="group/field flex flex-col gap-1.5">
    <label className={FIELD_LABEL_CLASS}>
      <User className={FIELD_LABEL_ICON_CLASS} /> Assignee
    </label>
    <Combobox
      value={value}
      onChange={onChange}
      isLoading={isLoading}
      disabled={disabled}
      placeholder="Search team members..."
      emptyOptionLabel="Unassigned"
      options={(users ?? []).map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName ?? ''}`.trim() + `, ${u.role}`,
      }))}
    />
  </div>
);
