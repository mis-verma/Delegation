import type { ReactNode } from 'react';
import { AlertTriangle, CheckSquare, ChevronRight, ClipboardCheck, Ticket as TicketIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Skeleton } from '../../components';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { ENTITY_CARD_CLASS } from '../../components/entityCard';
import { cn } from '../../lib/utils';
import { rateToneClass } from '../checklist/checklistDisplay';
import { formatPct } from '../../lib/percent';
import type { CardNumbers, OverdueItem, ReportState } from './teamDisplay';


/** A small popover listing exactly what's overdue, triggered by the badge itself (not the whole
 *  card). Checklist runs that were missed have no page of their own to jump to, so they are a plain
 *  summary row under the ticket/task links. */
export const OverdueBadge = ({ count, items, missedChecklists }: { count: number; items: OverdueItem[]; missedChecklists: number }) => {
  const navigate = useNavigate();

  if (count === 0) {
    // Plain text, same min-height as the button below, so a card with nothing overdue sits level
    // with its neighbours instead of being a few pixels shorter.
    return (
      <span className="inline-flex items-center min-h-11 sm:min-h-8 t-meta font-display font-medium text-text-muted">
        Nothing overdue
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 inline-flex items-center justify-center gap-1 min-h-11 sm:min-h-8 px-3 rounded-full t-meta font-display font-bold bg-danger/10 text-danger hover:bg-danger/20 transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          {count} overdue
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-border/50">
          <AlertTriangle size={13} className="text-danger" />
          <p className="t-meta font-display font-bold text-text-muted">Overdue</p>
        </div>
        <div className="flex flex-col max-h-64 overflow-y-auto">
          {missedChecklists > 0 && (
            <div className="flex items-center gap-2 min-h-11 px-3.5 py-2 border-b border-border/30">
              <ClipboardCheck size={13} className="shrink-0 text-text-light" />
              <span className="t-meta font-display font-medium text-text flex-1">
                {missedChecklists} store {missedChecklists === 1 ? 'checklist' : 'checklists'} missed in this period
              </span>
            </div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(item.link); }}
              className="flex items-center gap-2 min-h-11 px-3.5 py-2 text-left hover:bg-surface-hover transition-colors duration-150 ease-out cursor-pointer border-b border-border/30 last:border-b-0 outline-none focus-visible:bg-surface-hover"
            >
              {item.kind === 'ticket' ? <TicketIcon size={13} className="shrink-0 text-text-light" /> : <CheckSquare size={13} className="shrink-0 text-text-light" />}
              <span className="t-meta font-display font-medium text-text line-clamp-2 flex-1">{item.title}</span>
              <ChevronRight size={13} className="shrink-0 text-text-light" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** The card's headline: the Overall score from the scores report (the Scorecard's number), with Completion,
 *  On time and the raw counts under it. Skeleton lines, not a wrong figure, until the report resolves. */
export const ScoreFigure = ({ numbers, state }: { numbers: CardNumbers; state: ReportState }) => {
  if (state === 'loading') {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  // A failed report shows no number at all, instead of one that looks complete.
  const failed = state === 'error';
  const score = failed ? null : numbers.score;

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
      <span className={cn('t-figure font-display font-bold tabular-nums', score == null ? 'text-text-light' : rateToneClass(score))}>
        {formatPct(score)}
      </span>
      <span className="t-meta font-display font-medium text-text-muted">Overall score</span>
      {failed ? (
        <span className="t-meta font-display text-text-muted whitespace-nowrap">Scores didn't load</span>
      ) : numbers.completion == null ? (
        <span className="t-meta font-display text-text-muted whitespace-nowrap">Nothing due</span>
      ) : (
        <>
          <span className="t-meta font-display text-text-muted tabular-nums whitespace-nowrap">Completion {formatPct(numbers.completion)}</span>
          <span className="t-meta font-display text-text-muted tabular-nums whitespace-nowrap">On time {formatPct(numbers.onTime)}</span>
          <span className="t-meta font-display text-text-muted tabular-nums whitespace-nowrap">{numbers.done} of {numbers.due} done</span>
        </>
      )}
    </div>
  );
};

const countPart = (count: number, one: string, many: string) => (
  <span><strong className="font-bold text-text tabular-nums">{count}</strong> {count === 1 ? one : many}</span>
);

/** Footer: "Open now: <n> tickets, <n> delegations, <n> checklists" (today's open work, not part of any
 *  percentage), then the checklist answers-right line and the overdue badge. */
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
}) => {
  // Only what exists: "0 tickets, 0 delegations" on every card said nothing and crowded the real figure.
  const parts: { key: string; node: ReactNode }[] = [];
  if (openTickets > 0) parts.push({ key: 'tickets', node: countPart(openTickets, 'ticket', 'tickets') });
  if (openTasks > 0) parts.push({ key: 'delegations', node: countPart(openTasks, 'delegation', 'delegations') });
  if (state === 'loading') parts.push({ key: 'checklists', node: <Skeleton className="h-3.5 w-16" /> });
  else if (numbers.openChecklists != null && numbers.openChecklists > 0) parts.push({ key: 'checklists', node: countPart(numbers.openChecklists, 'checklist', 'checklists') });

  return (
    <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-border/60">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 t-meta font-display font-medium text-text-muted">
        {parts.length === 0 ? 'Nothing open now' : (
          <>
            <span>Open now:</span>
            {parts.map((p, i) => (
              <span key={p.key} className="inline-flex items-center">{p.node}{i < parts.length - 1 && ','}</span>
            ))}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        {/* Always present, so every card has the same rows and the grid stays level. Checklist
            only: tickets and delegations have no answers to check. */}
        <span className="inline-flex items-center gap-1 t-meta font-display font-medium text-text-muted">
          Checklist answers right:
          {state === 'loading' ? (
            <Skeleton className="h-3.5 w-8" />
          ) : numbers.compliance != null ? (
            <strong className={cn('font-bold tabular-nums', rateToneClass(numbers.compliance))}>{formatPct(numbers.compliance)}</strong>
          ) : (
            <span>{state === 'error' ? 'Not loaded' : 'No checks yet'}</span>
          )}
        </span>
        {state === 'loading' ? (
          <Skeleton className="h-11 sm:h-8 w-24 rounded-full" />
        ) : (
          <OverdueBadge count={overdueItems.length + numbers.missedChecklists} items={overdueItems} missedChecklists={numbers.missedChecklists} />
        )}
      </div>
    </div>
  );
};

/** Loading placeholder shaped like a real department/person card. */
export const TeamCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'gap-3 sm:p-4')}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-1 items-center gap-3 min-w-0">
        <Skeleton className="size-9 rounded-lg shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
    <div className="flex flex-col gap-2 pt-3 border-t border-border/60">
      <Skeleton className="h-3.5 w-4/5" />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 sm:h-8 w-24 rounded-full" />
      </div>
    </div>
  </div>
);
