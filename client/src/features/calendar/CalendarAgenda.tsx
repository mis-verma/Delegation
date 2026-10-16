import { ChevronRight, ChevronDown, Plus, CalendarCheck2 } from 'lucide-react';
import { Skeleton } from '../../components';
import { cn } from '@/lib/utils';
import { CalendarAddMenu } from './CalendarAddMenu';
import {
  calendarItemState,
  hasCalendarStatus,
  relativeDayLabel,
  CALENDAR_ITEM_LABEL,
  CALENDAR_ITEM_ICON,
  CALENDAR_ITEM_DOT_CLASS,
  type CalendarCreateKind,
  type CalendarItem,
} from './calendarDisplay';

interface CalendarAgendaProps {
  day: Date;
  today: Date;
  /** Already sorted by time. */
  items: CalendarItem[];
  isPending: boolean;
  onOpenItem: (link: string) => void;
  onCreate: (kind: CalendarCreateKind) => void;
}

const CREATE_ACTIONS: { kind: CalendarCreateKind; label: string }[] = [
  { kind: 'delegation', label: 'New delegation' },
  { kind: 'ticket', label: 'New ticket' },
];

const STATE_WORD = { completed: 'Done', overdue: 'Overdue', pending: 'Open' } as const;
const STATE_TONE = { completed: 'text-success', overdue: 'text-danger', pending: 'text-text-muted' } as const;

/**
 * The picked day's list, the way a phone calendar app shows a day: the time on the left, a bar in the item's
 * colour, then its title with its kind and state in one small line. A small "+ Add" sits in the header.
 */
export const CalendarAgenda = ({ day, today, items, isPending, onOpenItem, onCreate }: CalendarAgendaProps) => {
  const heading = day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(day.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
  const isPastDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const countLabel = isPending ? 'Loading' : items.length === 0 ? 'Nothing scheduled' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  return (
    <section
      aria-label={`Agenda for ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
      className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-surface overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="t-card font-display font-bold leading-tight text-text">
            <span className="text-primary-600 dark:text-primary-300">{relativeDayLabel(day, today)}</span>
            <span className="text-text-light"> · </span>
            {heading}
          </h2>
          <span className="text-[0.6875rem] font-medium text-text-muted">{countLabel}</span>
        </div>

        <CalendarAddMenu
          onPick={onCreate}
          trigger={
            <button
              type="button"
              className="group inline-flex shrink-0 items-center h-8 pointer-coarse:h-10 gap-1 pl-2.5 pr-2 rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white t-meta font-display font-semibold cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={3} />
              Add
              <ChevronDown size={12} strokeWidth={2.5} className="opacity-80 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-1.5 sm:px-2">
        {isPending ? (
          <div className="flex flex-col gap-1.5 p-1.5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-3 py-5 text-center">
            <span className="flex items-center justify-center size-9 rounded-full bg-surface-hover text-text-light" aria-hidden="true">
              <CalendarCheck2 size={16} />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="t-meta font-display font-semibold text-text">{isPastDay ? 'Nothing was due this day' : 'A clear day'}</p>
              <p className="max-w-[18rem] text-[0.6875rem] font-medium text-text-muted">
                {isPastDay ? 'You can still log a delegation or ticket against it.' : 'Add a delegation or a ticket for this date.'}
              </p>
            </div>
            <div className="flex w-full gap-2">
              {CREATE_ACTIONS.map(({ kind, label }) => {
                const Icon = CALENDAR_ITEM_ICON[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => onCreate(kind)}
                    className="flex flex-1 items-center justify-center gap-1.5 h-9 pointer-coarse:h-10 rounded-lg border border-dashed border-border-hover bg-surface-hover/30 px-2 t-meta font-display font-semibold text-text-secondary hover:border-primary-400 hover:text-primary-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <Icon size={14} strokeWidth={2.5} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/50">
            {items.map((item) => {
              const state = calendarItemState(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item.link)}
                    className="group flex w-full items-stretch gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors duration-150 hover:bg-surface-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <span className="w-14 shrink-0 pt-px text-right text-[0.6875rem] font-display font-semibold tabular-nums text-text-muted">
                      {item.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {/* The item's colour as a bar, as calendar apps mark an event. */}
                    <span className={cn('w-1 shrink-0 rounded-full', CALENDAR_ITEM_DOT_CLASS[item.type])} aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn('line-clamp-2 t-meta font-display font-semibold leading-snug', item.completed ? 'text-text-muted line-through decoration-text-light' : 'text-text')}>{item.title}</span>
                      <span className="text-[0.6875rem] font-medium text-text-muted">
                        {CALENDAR_ITEM_LABEL[item.type]}
                        {hasCalendarStatus(item.type) && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className={cn('font-semibold', STATE_TONE[state])}>{STATE_WORD[state]}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={14} strokeWidth={2.5} className="self-center shrink-0 text-text-light transition-colors duration-150 group-hover:text-primary-500" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
