import { Check, Trash2, X } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import type { LeaveEntry } from '../../api/leave';
import { removeLabel, type LeaveActions } from './leaveDisplay';

const ICON_BUTTON = 'size-11 shrink-0 px-0 pointer-fine:size-9';

export const LeaveActionButtons = ({ entry, actions }: { entry: LeaveEntry; actions: LeaveActions }) => {
  const { onApprove, onDecline, onRemove } = actions;
  if (!onApprove && !onDecline && !onRemove) return null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {onDecline && (
        <Button type="button" variant="outline" size="sm" aria-label={`Decline leave for ${entry.userName}`} title="Decline" className={cn(ICON_BUTTON, 'hover:border-danger/40 hover:text-danger')} onClick={() => onDecline(entry)}>
          <X size={16} aria-hidden="true" />
        </Button>
      )}
      {onApprove && (
        <Button type="button" variant="primary" size="sm" aria-label={`Approve leave for ${entry.userName}`} title="Approve" className={ICON_BUTTON} onClick={() => onApprove(entry)}>
          <Check size={16} aria-hidden="true" />
        </Button>
      )}
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" aria-label={removeLabel(entry)} title={removeLabel(entry)} className={cn(ICON_BUTTON, 'text-text-muted hover:bg-danger/10 hover:text-danger')} onClick={() => onRemove(entry)}>
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
};
