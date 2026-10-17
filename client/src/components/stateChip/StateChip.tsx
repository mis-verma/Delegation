import { CheckCircle2, CircleOff } from 'lucide-react';
import { IconChip } from '../iconChip';

interface StateChipProps {
  active: boolean;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StateChip = ({ active, label, className }: StateChipProps) => (
  <IconChip
    icon={active ? CheckCircle2 : CircleOff}
    tone={active ? 'bg-success' : 'bg-text-muted'}
    label={label ?? (active ? 'Active' : 'Inactive')}
    labelClassName={active ? 'text-success' : undefined}
    className={className ? `shrink-0 ${className}` : 'shrink-0'}
  />
);
