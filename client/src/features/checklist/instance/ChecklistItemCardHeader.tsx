import type { ReactNode } from 'react';
import { AlertTriangle, Check, CornerUpLeft, Flag, RotateCcw } from 'lucide-react';
import { IconChip } from '../../../components';
import { ChecklistItemIconTile } from './ChecklistItemIconTile';
import { ITEM_TYPE_ICON } from './checklistItemIcon';
import { formatDateTime, isFlaggedAnswer } from '../checklistDisplay';
import { useCanReopen } from './useCanReopen';
import { useAuth } from '../../../context/AuthContext';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistItemCardHeaderProps {
  item: ChecklistInstanceItem;
  interactive: boolean;
  onReopen?: () => void;
  reopenPending?: boolean;
  subtitle?: ReactNode;
}

export const ChecklistItemCardHeader = ({ item, interactive, onReopen, reopenPending, subtitle }: ChecklistItemCardHeaderProps) => {
  const canReopen = useCanReopen();
  const { user } = useAuth();
  const by = item.completedByName ? ` by ${item.completedBy === user?.id ? 'you' : item.completedByName}` : '';
  return (
    <div className="flex items-start gap-3">
      <ChecklistItemIconTile icon={ITEM_TYPE_ICON[item.itemType]} done={item.isDone} />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="t-card sm:text-sm font-display font-semibold leading-snug text-text">{item.label}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.isCritical && (
            <IconChip icon={Flag} tone="bg-danger" label="Critical" title="Critical question: a bad answer counts double against compliance" />
          )}
          {!item.isDone && item.sendBackNote && <IconChip icon={CornerUpLeft} tone="bg-danger" label="Sent back" />}
          {item.isDone && isFlaggedAnswer(item) && <IconChip icon={AlertTriangle} tone="bg-warning" label="Flagged" />}
          {item.isDone && !isFlaggedAnswer(item) && <IconChip icon={Check} tone="bg-success" label="Done" />}
        </div>
        {subtitle}
        {item.isDone && item.completedAt && (
          <p className="t-meta text-text-muted font-display">Completed {formatDateTime(item.completedAt)}{by}</p>
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
