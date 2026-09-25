import { useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

export interface SidebarSummaryData {
  total: number;
  newToday: number;
  due: number;
  overdue: number;
  completed: number;
  /** Only Delegations have a real draft concept — Tickets/To-Do/Checklists omit it rather than
   *  showing a "Draft: 0" row on a type that can never have one. */
  draft?: number;
}

interface SidebarSummaryBadgeProps {
  label: string;
  data: SidebarSummaryData | undefined;
  /** "Closed" for Tickets, "Completed" everywhere else — matches each type's own status label. */
  completedLabel?: string;
}

// Popover is click-triggered by default (Radix); this drives it from hover instead, with a short
// grace period on leave so the pointer can travel from the pill to the content without it
// vanishing mid-move — the same "hoverable tooltip" pattern a native OS menu uses.
const CLOSE_DELAY_MS = 150;

const StatRow = ({ label, value, dotClassName }: { label: string; value: number; dotClassName: string }) => (
  <div className="flex items-center justify-between gap-4 px-2 py-1.5 rounded-lg hover:bg-surface-hover">
    <span className="flex items-center gap-2 text-xs font-display font-semibold text-text-secondary">
      <span className={`size-1.5 rounded-full shrink-0 ${dotClassName}`} />
      {label}
    </span>
    <span className="text-xs font-display font-bold text-text tabular-nums">{value}</span>
  </div>
);

/**
 * The sidebar's per-item count pill — quiet by design. Nothing renders at all when there's
 * nothing actionable (`due + overdue === 0`), the same "no badge for zero" rule the collapsed
 * icon-only sidebar already follows elsewhere. Hovering the pill reveals the full breakdown
 * (new/due/overdue/completed/draft), which the pill's own single number can't carry.
 */
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
          // Theme navy, not a generic amber warning chip — this sidebar rail is all navy accents
          // (the active nav pill, the icons), and an unrelated yellow badge read as a stray,
          // off-brand patch rather than a considered part of the same design. Still distinct from
          // the plain "just active, nothing overdue" gray below it, just recolored to the app's
          // own palette instead of the generic status-warning one.
          className={`shrink-0 min-w-[1.25rem] h-[1.125rem] px-1.5 rounded-full text-[10.5px] font-display font-bold flex items-center justify-center tabular-nums cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
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
        // Radix returns DOM focus to the trigger by default when the content closes. That refocus
        // fires the trigger's own onFocus above, which reopens it — an infinite open/close loop on
        // every hover-away. This is a hover-driven info popover, not a dialog people tab into, so
        // there's nothing worth restoring focus to on close.
        onCloseAutoFocus={(e) => e.preventDefault()}
        side="right"
        align="start"
        className="w-56"
      >
        <p className="text-xs font-display font-bold text-text px-2 pb-1.5 mb-1 border-b border-border/60">{label}</p>
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
