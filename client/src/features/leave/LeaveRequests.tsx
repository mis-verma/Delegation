import { memo, useState } from 'react';
import { Ban, Check, Hourglass, MessageSquareText, TriangleAlert, X } from 'lucide-react';
import { Avatar, Button, IconChip, Input, Modal, PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import type { LeaveEntry } from '../../api/leave';
import { leaveDays, leaveRange, openWorkText } from './leaveDisplay';

const FAINT = 'bg-surface-hover/80';
const ACTION = 'h-11 flex-1 pointer-fine:h-9 sm:flex-none';
const DECLINE_REASONS = ['Too many away that day', 'Busy period', 'Talk to me first'] as const;

interface RequestCardProps {
  entry: LeaveEntry;
  busy: boolean;
  onApprove?: (entry: LeaveEntry) => void;
  onDecline?: (entry: LeaveEntry) => void;
  onWithdraw?: (entry: LeaveEntry) => void;
}

const statusChip = (entry: LeaveEntry) => {
  if (entry.status === 'DECLINED') return <IconChip icon={Ban} tone="bg-danger" label="Declined" labelClassName="text-danger" />;
  return <IconChip icon={Hourglass} tone="bg-warning" label="Waiting for approval" labelClassName="text-warning" />;
};

export const RequestCard = memo(({ entry, busy, onApprove, onDecline, onWithdraw }: RequestCardProps) => {
  const work = openWorkText(entry);
  const declined = entry.status === 'DECLINED';
  return (
    <li
      aria-busy={busy || undefined}
      className={cn(
        PANEL_CLASS,
        'flex flex-col gap-3 p-3 transition-[border-color,opacity] duration-150 ease-out sm:p-4',
        declined ? 'border-danger/25' : 'border-warning/30',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar name={entry.userName} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-1 t-card font-display font-bold text-text">{entry.mine ? 'You' : entry.userName}</span>
          <span className="line-clamp-1 t-meta font-display text-text-muted">{entry.departmentName ?? 'No department'}</span>
        </div>
      </div>

      <p className="t-meta font-display font-semibold tabular-nums text-text-secondary">
        {leaveRange(entry)}
        <span className="font-medium text-text-muted">, {leaveDays(entry)}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {statusChip(entry)}
        {entry.reason && <IconChip icon={MessageSquareText} tone={FAINT} label={entry.reason} title={entry.reason} labelClassName="truncate" />}
      </div>

      {declined && (
        <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 t-meta font-display font-medium text-danger">
          {entry.decidedByName ? `${entry.decidedByName} declined this` : 'Declined'}
          {entry.declineNote ? `: ${entry.declineNote}` : '.'}
        </p>
      )}

      {work && !declined && (
        <p className="flex items-start gap-1.5 rounded-lg bg-vivid-red/10 px-2.5 py-1.5 t-meta font-display font-semibold text-vivid-red-text">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          Still open for {entry.mine ? 'you' : 'them'}: {work}.
        </p>
      )}

      {(onApprove || onDecline || onWithdraw) && (
        <div className="flex items-center gap-2 sm:justify-end">
          {onWithdraw && (
            <Button type="button" variant="outline" size="sm" className={ACTION} onClick={() => onWithdraw(entry)}>
              {declined ? 'Dismiss' : 'Withdraw'}
            </Button>
          )}
          {onDecline && (
            <Button type="button" variant="outline" size="sm" className={cn(ACTION, 'hover:border-danger/40 hover:text-danger')} onClick={() => onDecline(entry)}>
              <X size={15} aria-hidden="true" />
              Decline
            </Button>
          )}
          {onApprove && (
            <Button type="button" variant="primary" size="sm" className={ACTION} onClick={() => onApprove(entry)}>
              <Check size={15} aria-hidden="true" />
              Approve
            </Button>
          )}
        </div>
      )}
    </li>
  );
});
RequestCard.displayName = 'RequestCard';

interface DeclineDialogProps {
  entry: LeaveEntry;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

export const DeclineDialog = ({ entry, busy, onClose, onConfirm }: DeclineDialogProps) => {
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      icon={<Ban className="size-5" />}
      iconTone="danger"
      title={`Decline leave for ${entry.userName}?`}
      description={`${leaveRange(entry)}, ${leaveDays(entry)}. They get a notice with your note.`}
      showCloseButton={false}
      footer={(
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="max-sm:h-11">Cancel</Button>
          <Button type="button" variant="primary" size="sm" isLoading={busy} onClick={() => onConfirm(note.trim())} className="bg-danger hover:bg-danger/90 active:bg-danger/80 max-sm:h-11">
            Decline
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-2">
        <span className="t-meta font-display font-semibold text-text-secondary">Note <span className="font-medium text-text-light">(optional)</span></span>
        <div role="group" aria-label="Quick notes" className="flex flex-wrap gap-1.5">
          {DECLINE_REASONS.map((r) => {
            const on = note === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => setNote(on ? '' : r)}
                className={cn(
                  'h-11 cursor-pointer touch-manipulation rounded-lg border px-3 t-meta font-display font-semibold outline-none transition-[border-color,background-color,color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-fine:h-9',
                  on ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover',
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
        <Input aria-label="Note in your own words" placeholder="Or write a short note" value={note} maxLength={191} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
};
