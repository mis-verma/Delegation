import type { LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { cn } from '../../lib/utils';

export interface PriorityChipMeta {
  label: string;
  /** Solid bg-* class for the chip's icon circle — see IconChip. */
  solid: string;
  icon: LucideIcon;
}

interface PriorityChipProps {
  meta: PriorityChipMeta;
  className?: string;
  /** Opt in to a bare coloured circle on a phone (see StatusChip). Off by default. */
  iconOnlyOnMobile?: boolean;
  /** @deprecated The word now shows on a phone by default. */
  showLabelOnMobile?: boolean;
}

// A colored icon circle + label chip driven by a domain's own priority map (Task's PRIORITY_MAP,
// Ticket's PRIORITY_CONFIG — both carry this {label, solid, icon} shape alongside their other,
// non-chip fields like `bar`/`stripe` for the Gantt views) — shared here so tasks and tickets
// render priority identically instead of each hand-rolling the same markup.
export const PriorityChip = ({ meta, className, iconOnlyOnMobile = false }: PriorityChipProps) => (
  <IconChip icon={meta.icon} tone={meta.solid} label={meta.label} className={cn('shrink-0', className)} iconOnlyOnMobile={iconOnlyOnMobile} />
);
