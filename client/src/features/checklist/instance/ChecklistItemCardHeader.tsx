import type { ReactNode } from 'react';
import { Flag, RotateCcw } from 'lucide-react';
import { IconChip } from '../../../components';
import { ChecklistItemIconTile } from './ChecklistItemIconTile';
import { ITEM_TYPE_ICON } from './checklistItemIcon';
import { formatDateTime } from '../checklistDisplay';
import { useCanReopen } from './useCanReopen';
import { useAuth } from '../../../context/AuthContext';
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

// Leading icon tile + label + "Completed" line + reopen button, shared by every instance item card
// (only the reopen button's mutate payload differs per item type, which stays in each card as the
// `onReopen` callback). The text column spaces its lines with gap, so a subtitle needs no margin.
export const ChecklistItemCardHeader = ({ item, interactive, onReopen, reopenPending, subtitle }: ChecklistItemCardHeaderProps) => {
  const canReopen = useCanReopen();
  const { user } = useAuth();
  const by = item.completedByName ? ` by ${item.completedBy === user?.id ? 'you' : item.completedByName}` : '';
  return (
    <div className="flex items-start gap-3">
      <ChecklistItemIconTile icon={ITEM_TYPE_ICON[item.itemType]} done={item.isDone} />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-[0.9375rem] sm:text-sm font-display font-medium leading-snug text-text">{item.label}</p>
        {item.isCritical && (
          <IconChip icon={Flag} tone="bg-danger" label="Critical" title="Critical question: a bad answer counts double against compliance" className="w-fit" />
        )}
        {subtitle}
        {item.isDone && item.completedAt && (
          <p className="text-xs text-text-muted font-display">Completed {formatDateTime(item.completedAt)}{by}</p>
        )}
      </div>
      {interactive && item.isDone && onReopen && canReopen && (
        <button
          type="button"
          onClick={onReopen}
          disabled={reopenPending}
          className="shrink-0 flex items-center justify-center size-11 sm:size-8 rounded-md text-text-light hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
          aria-label="Reopen item"
          title="Reopen (admin only)"
        >
          <RotateCcw className="size-4" />
        </button>
      )}
    </div>
  );
};
