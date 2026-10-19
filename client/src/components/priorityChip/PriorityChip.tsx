import type { LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { cn } from '../../lib/utils';

export interface PriorityChipMeta {
  label: string;
  solid: string;
  icon: LucideIcon;
}

interface PriorityChipProps {
  meta: PriorityChipMeta;
  className?: string;
  iconOnlyOnMobile?: boolean;
  showLabelOnMobile?: boolean;
}

export const PriorityChip = ({ meta, className, iconOnlyOnMobile = false }: PriorityChipProps) => (
  <IconChip icon={meta.icon} tone={meta.solid} label={meta.label} className={cn('shrink-0', className)} iconOnlyOnMobile={iconOnlyOnMobile} />
);
