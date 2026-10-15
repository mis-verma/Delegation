import { AlertTriangle, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { PriorityChipMeta } from './PriorityChip';

/** The ONE look of each priority (word, icon, circle colour) for To-Do, Delegation and Ticket. Their own maps
 *  take label, solid and icon from here and add only what is theirs (bars, stripes), so a priority cannot read
 *  differently from one module to the next. To-Do and Delegation have no Critical. */
export const PRIORITY_CHIP_META = {
  low: { label: 'Low', solid: 'bg-text-light', icon: ArrowDown },
  medium: { label: 'Medium', solid: 'bg-warning', icon: Minus },
  high: { label: 'High', solid: 'bg-danger', icon: ArrowUp },
  critical: { label: 'Critical', solid: 'bg-danger', icon: AlertTriangle },
} satisfies Record<string, PriorityChipMeta>;
