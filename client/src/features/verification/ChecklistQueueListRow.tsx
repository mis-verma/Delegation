import { memo } from 'react';
import { Check, CornerUpLeft, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { complianceToneClass } from '../checklist/checklistDisplay';
import { WaitingTag } from './ChecklistQueueRow';
import { GROUP_LOOK } from './checklistQueueLayout';
import { formatWaiting, groupOf, type ChecklistRow } from './verificationModel';
import { useSharedNow } from '../../lib/useSharedNow';

interface ChecklistQueueListRowProps {
  row: ChecklistRow;
  active: boolean;
  showDepartment?: boolean;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onSendBack: (id: string) => void;
}

export const ChecklistQueueListRow = memo(function ChecklistQueueListRow({
  row, active, showDepartment = true, onOpen, onApprove, onSendBack,
}: ChecklistQueueListRowProps) {
  const now = useSharedNow();
  const { id, instance, risk } = row;
  const group = groupOf(row);
  const look = GROUP_LOOK[group];
  const percent = risk.compliance ?? 100;
  const waiting = formatWaiting(row.waitingSince, now);

  return (
    <li className="relative">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border pl-3 pr-2 py-2 transition-colors duration-150',
          look.tint,
          active ? 'border-border-hover' : 'border-border/60 hover:border-border-hover',
        )}
      >
        <span className={cn('h-10 w-1 shrink-0 rounded-full', look.accentBar)} aria-hidden="true" />

        <button
          type="button"
          data-queue-row={id}
          aria-current={active ? 'true' : undefined}
          onClick={() => onOpen(id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer outline-none rounded-md focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="t-card font-display font-semibold text-text leading-snug truncate">{instance.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 t-meta font-display text-text-muted">
              {row.storeName && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Store size={11} aria-hidden /> {row.storeName}
                </span>
              )}
              {showDepartment && <span className="truncate">{row.deptName}</span>}
            </span>
          </span>

          <span className="hidden sm:flex items-center gap-1.5 shrink-0 w-24">
            <look.icon size={13} aria-hidden className={look.text} />
            <span className={cn('t-meta font-display font-bold tabular-nums', complianceToneClass(percent))}>{percent}%</span>
          </span>

          <span className="hidden md:inline-flex shrink-0 w-24 justify-end">
            <WaitingTag label={waiting} title={`Waiting ${waiting}`} tone={(now - row.waitingSince) / 86_400_000 >= 3 ? 'slow' : 'normal'} />
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Send back"
            aria-label={`Send back ${instance.title}`}
            onClick={() => onSendBack(id)}
            className="flex size-9 items-center justify-center rounded-lg text-danger outline-none transition-colors duration-150 cursor-pointer hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            <CornerUpLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            title="Approve"
            aria-label={`Approve ${instance.title}`}
            onClick={() => onApprove(id)}
            className="flex size-9 items-center justify-center rounded-lg bg-success-strong text-white outline-none transition-colors duration-150 cursor-pointer hover:bg-success-strong/90 focus-visible:ring-2 focus-visible:ring-success/40"
          >
            <Check size={16} aria-hidden />
          </button>
        </span>
      </div>
    </li>
  );
});
