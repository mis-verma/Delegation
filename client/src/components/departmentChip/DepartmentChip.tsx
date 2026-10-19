import { Building2 } from 'lucide-react';
import { departmentDotClass } from '../../lib/departmentTagColors';
import { IconChip } from '../iconChip';

interface DepartmentChipProps {
  name: string;
  className?: string;
  iconOnlyOnMobile?: boolean;
  showLabelOnMobile?: boolean;
}

export const DepartmentChip = ({ name, className, iconOnlyOnMobile = false }: DepartmentChipProps) => (
  <IconChip icon={Building2} tone={departmentDotClass(name)} label={name} title={name} className={className} iconOnlyOnMobile={iconOnlyOnMobile} />
);
