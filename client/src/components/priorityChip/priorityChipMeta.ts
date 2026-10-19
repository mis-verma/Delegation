import { AlertTriangle, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { PriorityChipMeta } from './PriorityChip';

export const PRIORITY_CHIP_META = {
  low: { label: 'Low', solid: 'bg-linear-to-br from-success to-success/70', icon: ArrowDown },
  medium: { label: 'Medium', solid: 'bg-linear-to-br from-warning to-warning/70', icon: Minus },
  high: { label: 'High', solid: 'bg-linear-to-br from-danger to-danger/70', icon: ArrowUp },
  critical: { label: 'Critical', solid: 'bg-linear-to-br from-danger to-coral-600', icon: AlertTriangle },
} satisfies Record<string, PriorityChipMeta>;
