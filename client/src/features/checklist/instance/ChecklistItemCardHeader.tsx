import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { ChecklistItemIconTile } from './ChecklistItemIconTile';
import { ITEM_TYPE_ICON } from './checklistItemIcon';
import { formatDate } from '../checklistDisplay';
import { useCanReopen } from './useCanReopen';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistItemCardHeaderProps {
  item: ChecklistInstanceItem;
  // Whether the item's still open for editing (canWork && !isLocked) — NOT gated on item.isDone
  // itself, since the reopen button below needs exactly the opposite (isDone) alongside this.
  interactive: boolean;
  // Omitted by cards with no item-level reopen (AUDIT reopens one person's row at a time, inside
  // the card) — no button renders without it. Only an admin ever sees the button (useCanReopen).
  onReopen?: () => void;
  reopenPending?: boolean;
  // Per-type info line between the label and the "Completed" line (NumberEntry/CashTally's
  // range/unit/expected-amount hint) — most cards have none.
  subtitle?: ReactNode;
}

// Leading icon tile + label + "Completed" line + reopen button, identical across 11 of the 13
// instance item cards (only the reopen button's mutate payload differs per item type, which stays
// in each card as the `onReopen` callback). Was ~15-20 lines copy-pasted per file.
export const ChecklistItemCardHeader = ({ item, interactive, onReopen, reopenPending, subtitle }: ChecklistItemCardHeaderProps) => {
  const canReopen = useCanReopen();
  return (
    <div className="flex items-start gap-3">
      <ChecklistItemIconTile icon={ITEM_TYPE_ICON[item.itemType]} done={item.isDone} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-medium leading-snug text-text">{item.label}</p>
        {subtitle}
        {item.isDone && item.completedAt && (
          <p className="text-xs text-text-muted font-display mt-0.5">Completed {formatDate(item.completedAt)}</p>
        )}
      </div>
      {interactive && item.isDone && onReopen && canReopen && (
        <button
          onClick={onReopen}
          disabled={reopenPending}
          className="shrink-0 p-2 rounded-md text-text-light hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
          aria-label="Reopen item"
          title="Reopen (admin only)"
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
};
