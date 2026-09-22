import type { LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';

export interface PriorityChipMeta {
  label: string;
  /** Solid bg-* class for the chip's icon circle — see IconChip. */
  solid: string;
  icon: LucideIcon;
}

interface PriorityChipProps {
  meta: PriorityChipMeta;
  className?: string;
}

// A colored icon circle + label chip driven by a domain's own priority map (Task's PRIORITY_MAP,
// Ticket's PRIORITY_CONFIG — both carry this {label, solid, icon} shape alongside their other,
// non-chip fields like `bar`/`stripe` for the Gantt views) — shared here so tasks and tickets
// render priority identically instead of each hand-rolling the same markup.
export const PriorityChip = ({ meta, className }: PriorityChipProps) => (
  <IconChip icon={meta.icon} tone={meta.solid} label={meta.label} className={className} />
);
