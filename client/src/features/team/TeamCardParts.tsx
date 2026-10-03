import { AlertTriangle, CheckSquare, ChevronRight, ClipboardCheck, Ticket as TicketIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { RadialGauge, Skeleton } from '../../components';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { ENTITY_CARD_CLASS } from '../../components/entityCard';
import { cn } from '../../lib/utils';
import { rateToneClass } from '../checklist/checklistDisplay';
import { completionGaugeColor, type CardNumbers, type OverdueItem, type ReportState } from './teamDisplay';


/** A small popover listing exactly what's overdue, triggered by the badge itself (not the whole
 *  card). Checklist runs that were missed have no page of their own to jump to, so they are a plain
 *  summary row under the ticket/task links. */
export const OverdueBadge = ({ count, items, missedChecklists }: { count: number; items: OverdueItem[]; missedChecklists: number }) => {
  const navigate = useNavigate();

  if (count === 0) {
    return (
      <span className="inline-flex items-center justify-center text-xs font-display font-bold px-2 py-0.5 rounded bg-surface-hover text-text-muted">
        0 overdue
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 inline-flex items-center justify-center gap-1 min-h-11 sm:min-h-8 px-3 sm:px-2 rounded text-xs font-display font-bold bg-danger/10 text-danger hover:bg-danger/20 transition-colors duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          {count} overdue
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-border/50">
          <AlertTriangle size={13} className="text-danger" />
          <p className="text-xs font-display font-bold text-text-muted">Overdue</p>
        </div>
        <div className="flex flex-col max-h-64 overflow-y-auto">
          {missedChecklists > 0 && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/30">
              <ClipboardCheck size={13} className="shrink-0 text-text-light" />
              <span className="text-xs font-display font-medium text-text flex-1">
                {missedChecklists} store {missedChecklists === 1 ? 'checklist' : 'checklists'} missed
              </span>
            </div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(item.link); }}
              className="flex items-center gap-2 px-3.5 py-3 text-left hover:bg-surface-hover transition-colors duration-200 cursor-pointer border-b border-border/30 last:border-b-0 outline-none focus-visible:bg-surface-hover"
            >
              {item.kind === 'ticket' ? <TicketIcon size={13} className="shrink-0 text-text-light" /> : <CheckSquare size={13} className="shrink-0 text-text-light" />}
              <span className="text-xs font-display font-medium text-text line-clamp-2 flex-1">{item.title}</span>
              <ChevronRight size={13} className="shrink-0 text-text-light" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** Overall completion ring: tickets + delegations + store checklist runs together. Decorative (the
 *  card itself is the click target). A skeleton disc, not a wrong 0%, until the report resolves. */
export const CompletionRing = ({ numbers, state }: { numbers: CardNumbers; state: ReportState }) => {
  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center gap-1 shrink-0">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <RadialGauge
        percent={numbers.rate ?? 0}
        size={56}
        variant="circle"
        gradientFrom={completionGaugeColor(numbers.rate)}
        gradientTo={completionGaugeColor(numbers.rate)}
      >
        <span
          title={numbers.rate == null ? 'Nothing to measure yet' : undefined}
          className={cn('text-xs font-display font-black tabular-nums', numbers.rate == null ? 'text-text-muted' : 'text-text')}
        >
          {numbers.rate == null ? 'n/a' : `${numbers.rate}%`}
        </span>
      </RadialGauge>
      {numbers.total > 0 && (
        <span className="text-xs font-display font-medium text-text-muted tabular-nums whitespace-nowrap">{numbers.done}/{numbers.total} done</span>
      )}
    </div>
  );
};

/** Footer: "<n> tickets · <n> delegations · <n> checklists", then an optional compliance chip and
 *  the overdue badge. */
export const CardFooter = ({
  openTickets,
  openTasks,
  overdueItems,
  numbers,
  state,
}: {
  openTickets: number;
  openTasks: number;
  overdueItems: OverdueItem[];
  numbers: CardNumbers;
  state: ReportState;
}) => (
  <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-border/60">
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-display font-medium text-text-muted">
      <span><strong className="font-bold text-text">{openTickets}</strong> tickets</span>
      <span aria-hidden>·</span>
      <span><strong className="font-bold text-text">{openTasks}</strong> delegations</span>
      <span aria-hidden>·</span>
      {numbers.checklists == null ? (
        <span className="inline-flex items-center gap-1">
          {state === 'loading' ? <Skeleton className="h-3.5 w-5" /> : <strong className="font-bold text-text">n/a</strong>}
          checklists
        </span>
      ) : (
        <span><strong className="font-bold text-text">{numbers.checklists}</strong> checklists</span>
      )}
    </p>

    <div className="flex items-center justify-between gap-2">
      {numbers.compliance != null ? (
        <span className="inline-flex items-center gap-1 text-xs font-display font-medium text-text-muted">
          Compliance
          <strong className={cn('font-bold tabular-nums', rateToneClass(numbers.compliance))}>{numbers.compliance}%</strong>
        </span>
      ) : <span />}
      {state === 'loading' ? (
        <Skeleton className="h-6 w-20 rounded" />
      ) : (
        <OverdueBadge count={numbers.overdue} items={overdueItems} missedChecklists={numbers.missedChecklists} />
      )}
    </div>
  </div>
);

/** Loading placeholder shaped like a real department/person card. */
export const TeamCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'gap-3 sm:p-4')}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        <Skeleton className="size-9 rounded-lg shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
    <div className="flex flex-col gap-2 pt-3 border-t border-border/60">
      <Skeleton className="h-3.5 w-4/5" />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-20 rounded" />
      </div>
    </div>
  </div>
);
