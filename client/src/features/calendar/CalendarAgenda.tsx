import { AlertTriangle, CalendarCheck2, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Plus, type LucideIcon } from 'lucide-react';
import { IconChip, Skeleton } from '../../components';
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
  type CalendarItemState,
} from './calendarDisplay';

interface CalendarAgendaProps {
  day: Date;
  today: Date;
  items: CalendarItem[];
  isPending: boolean;
  onOpenItem: (link: string) => void;
  onCreate: (kind: CalendarCreateKind) => void;
}

const CREATE_ACTIONS: { kind: CalendarCreateKind; label: string }[] = [
  { kind: 'delegation', label: 'New delegation' },
  { kind: 'ticket', label: 'New ticket' },
];

const STATE_LOOK: Record<CalendarItemState, { label: string; icon: LucideIcon; tone: string; text?: string }> = {
  completed: { label: 'Done', icon: CheckCircle2, tone: 'bg-success', text: 'text-success' },
  overdue: { label: 'Overdue', icon: AlertTriangle, tone: 'bg-danger', text: 'text-danger' },
  pending: { label: 'Open', icon: CircleDot, tone: 'bg-primary-600 dark:bg-primary-400' },
};

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
          <span className="t-meta font-medium text-text-muted">{countLabel}</span>
        </div>

        <CalendarAddMenu
          onPick={onCreate}
          trigger={
            <button
              type="button"
              className="group inline-flex h-11 shrink-0 cursor-pointer touch-manipulation items-center gap-1 rounded-xl bg-primary-800 pl-3 pr-2.5 t-meta font-display font-semibold text-white outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-primary-700 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 pointer-fine:h-9"
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
          <div className="flex flex-col gap-1.5 p-1.5" role="status" aria-label="Loading the day">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-3 py-5 text-center">
            <span className="flex items-center justify-center size-9 rounded-full bg-surface-hover text-text-light" aria-hidden="true">
              <CalendarCheck2 size={16} />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="t-meta font-display font-semibold text-text">{isPastDay ? 'Nothing was due this day' : 'A clear day'}</p>
              <p className="max-w-[18rem] t-meta font-medium text-text-muted">
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
                    className="flex h-11 flex-1 cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-surface px-2 t-meta font-display font-semibold text-text-secondary transition-[border-color,color,transform] duration-150 ease-out hover:border-primary-500/40 hover:text-primary-700 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:text-primary-300 pointer-fine:h-9"
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
                    className="group flex min-h-14 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-surface-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <span className="w-14 shrink-0 text-right t-meta font-display font-semibold tabular-nums text-text-muted">
                      {item.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className={cn('w-1 shrink-0 self-stretch rounded-full', CALENDAR_ITEM_DOT_CLASS[item.type])} aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className={cn('line-clamp-2 t-card font-display font-semibold leading-snug', item.completed ? 'text-text-muted line-through decoration-text-light' : 'text-text')}>{item.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <IconChip icon={CALENDAR_ITEM_ICON[item.type]} tone={CALENDAR_ITEM_DOT_CLASS[item.type]} label={CALENDAR_ITEM_LABEL[item.type]} />
                        {hasCalendarStatus(item.type) && (
                          <IconChip icon={STATE_LOOK[state].icon} tone={STATE_LOOK[state].tone} label={STATE_LOOK[state].label} labelClassName={STATE_LOOK[state].text} />
                        )}
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-light transition-colors duration-150 group-hover:text-primary-500" aria-hidden="true" />
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
