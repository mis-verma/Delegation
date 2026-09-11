import { Building2 } from 'lucide-react';
import { Combobox } from '../../../components';
import { LABEL_CLASS } from './formConstants';
import type { Department } from '@/api/departments';

interface DepartmentFieldProps {
  value: string | undefined;
  onChange: (id: string) => void;
  departments: Department[] | undefined;
  disabled?: boolean;
}

export const DepartmentField = ({ value, onChange, departments, disabled }: DepartmentFieldProps) => (
  <div className="flex flex-col gap-2">
    <label className={LABEL_CLASS}>
      <Building2 className="w-3.5 h-3.5" /> Department
    </label>
    <Combobox
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      placeholder="Search departments..."
      emptyOptionLabel="Any department"
      options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
    />
  </div>
);
