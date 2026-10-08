import { Building2 } from 'lucide-react';
import { departmentDotClass } from '../../lib/departmentTagColors';
import { IconChip } from '../iconChip';

interface DepartmentChipProps {
  name: string;
  className?: string;
  /** Keep the name beside the icon on a phone (off by default, see StatusChip). */
  showLabelOnMobile?: boolean;
}

// A department name gets one of a rotating palette of hues (hashed from its own name) so distinct
// departments stay visually distinguishable — the color assignment lives in
// lib/departmentTagColors, this component is just the shared chip markup around it, so tasks and
// tickets render the same department tag instead of each hand-rolling their own.
export const DepartmentChip = ({ name, className, showLabelOnMobile = false }: DepartmentChipProps) => (
  <IconChip icon={Building2} tone={departmentDotClass(name)} label={name} className={className} iconOnlyOnMobile={!showLabelOnMobile} />
);
