import { Building2 } from 'lucide-react';
import { departmentDotClass } from '../../lib/departmentTagColors';
import { IconChip } from '../iconChip';

interface DepartmentChipProps {
  name: string;
  className?: string;
  /** Opt in to a bare coloured circle on a phone (see StatusChip). Off by default. A long name
   *  still truncates when its row is narrower than the chip. */
  iconOnlyOnMobile?: boolean;
  /** @deprecated The name now shows on a phone by default. */
  showLabelOnMobile?: boolean;
}

// A department name gets one of a rotating palette of hues (hashed from its own name) so distinct
// departments stay visually distinguishable — the color assignment lives in
// lib/departmentTagColors, this component is just the shared chip markup around it, so tasks and
// tickets render the same department tag instead of each hand-rolling their own.
export const DepartmentChip = ({ name, className, iconOnlyOnMobile = false }: DepartmentChipProps) => (
  <IconChip icon={Building2} tone={departmentDotClass(name)} label={name} title={name} className={className} iconOnlyOnMobile={iconOnlyOnMobile} />
);
