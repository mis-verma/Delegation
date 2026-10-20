import { useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

export interface SidebarSummaryData {
  total: number;
  newToday: number;
  due: number;
  overdue: number;
  completed: number;
  draft?: number;
}

interface SidebarSummaryBadgeProps {
  label: string;
  data: SidebarSummaryData | undefined;
  completedLabel?: string;
}

const CLOSE_DELAY_MS = 150;

const StatRow = ({ label, value, dotClassName }: { label: string; value: number; dotClassName: string }) => (
  <div className="flex items-center justify-between gap-4 px-2 py-1.5 rounded-lg hover:bg-surface-hover">
    <span className="flex items-center gap-2 t-meta font-display font-semibold text-text-secondary">
      <span className={`size-1.5 rounded-full shrink-0 ${dotClassName}`} />
      {label}
    </span>
    <span className="t-meta font-display font-bold text-text tabular-nums">{value}</span>
  </div>
);

export const SidebarSummaryBadge = ({ label, data, completedLabel = 'Completed' }: SidebarSummaryBadgeProps) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  if (!data) return null;
  const active = data.due + data.overdue;
  if (active <= 0) return null;

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
          onFocus={() => setOpen(true)}
          onBlur={scheduleClose}
          tabIndex={0}
          role="button"
          aria-label={`${label}: ${active} to act on — ${data.overdue} overdue`}
          className={`shrink-0 min-w-[1.25rem] h-[1.125rem] px-1.5 rounded-full t-meta font-display font-bold flex items-center justify-center tabular-nums cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
            data.overdue > 0
              ? 'bg-primary-500/15 text-primary-700 dark:bg-primary-500/25 dark:text-primary-300'
              : 'bg-surface-active text-text-secondary'
          }`}
        >
          {active}
        </span>
      </PopoverTrigger>
      <PopoverContent
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onCloseAutoFocus={(e) => e.preventDefault()}
        side="right"
        align="start"
        className="w-56"
      >
        <p className="t-meta font-display font-bold text-text px-2 pb-1.5 mb-1 border-b border-border/60">{label}</p>
        <div className="flex flex-col gap-0.5">
          {data.newToday > 0 && <StatRow label="New today" value={data.newToday} dotClassName="bg-primary-500" />}
          <StatRow label="Due" value={data.due} dotClassName="bg-warning" />
          {data.overdue > 0 && <StatRow label="Overdue" value={data.overdue} dotClassName="bg-danger" />}
          <StatRow label={completedLabel} value={data.completed} dotClassName="bg-success" />
          {data.draft !== undefined && data.draft > 0 && <StatRow label="Draft" value={data.draft} dotClassName="bg-text-light" />}
        </div>
      </PopoverContent>
    </Popover>
  );
};
