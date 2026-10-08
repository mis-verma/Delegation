import { ChevronRight, ChevronDown, Plus, Inbox } from 'lucide-react';
import { Skeleton, StatusChip } from '../../components';
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

export const CalendarAgenda = ({ day, today, items, isPending, onOpenItem, onCreate }: CalendarAgendaProps) => {
  const heading = day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...(day.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
  const isPastDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const countLabel = isPending ? 'Loading' : items.length === 0 ? 'Nothing scheduled' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  return (
    <section
      aria-label={`Agenda for ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
      className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[0.6875rem] font-display font-semibold text-primary-600 dark:text-primary-400">{relativeDayLabel(day, today)}</span>
          <h2 className="text-base sm:text-lg font-display font-bold leading-tight text-text tracking-tight">{heading}</h2>
          <span className="text-xs font-medium text-text-muted">{countLabel}</span>
        </div>

        <CalendarAddMenu
          onPick={onCreate}
          trigger={
            <button
              type="button"
              className="group inline-flex shrink-0 items-center h-11 sm:h-10 gap-1.5 pl-3.5 pr-3 rounded-full bg-primary-800 hover:bg-primary-900 dark:bg-primary-600 dark:hover:bg-primary-500 text-white text-sm font-display font-semibold ring-1 ring-inset ring-white/10 transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] disabled:opacity-50 data-[state=open]:bg-primary-900 dark:data-[state=open]:bg-primary-500"
            >
              <Plus size={16} strokeWidth={3} className="transition-transform duration-300 group-hover:rotate-90" />
              Add
              <ChevronDown size={14} strokeWidth={2.5} className="opacity-80 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 sm:p-4">
        {isPending ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex items-center justify-center size-11 rounded-full border border-border bg-surface-hover">
              <Inbox size={18} className="text-text-light" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-display font-semibold text-text">{isPastDay ? 'Nothing was due this day' : 'A clear day'}</p>
              <p className="max-w-[18rem] text-xs font-medium text-text-muted">
                {isPastDay ? 'You can still log a delegation or ticket against it.' : 'Plan ahead by adding a delegation or a ticket for this date.'}
              </p>
            </div>
            <div className="flex w-full flex-col sm:flex-row gap-2">
              {CREATE_ACTIONS.map(({ kind, label }) => {
                const Icon = CALENDAR_ITEM_ICON[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => onCreate(kind)}
                    className="flex flex-1 items-center justify-center gap-2 h-11 rounded-xl border border-border bg-surface px-3 text-sm font-display font-semibold text-text-secondary hover:border-primary-500/40 hover:bg-surface-hover hover:text-text transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
                  >
                    <Icon size={16} strokeWidth={2.5} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          items.map((item) => {
            const Icon = CALENDAR_ITEM_ICON[item.type];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item.link)}
                className="group flex w-full min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-all duration-200 ease-in-out hover:border-primary-500/40 hover:bg-surface-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
              >
                {/* Solid type colour + white glyph, the same pairing as the grid dots, so a row is
                    recognisable from the colour alone. */}
                <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 text-white ${CALENDAR_ITEM_DOT_CLASS[item.type]}`}>
                  <Icon size={16} strokeWidth={2.25} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm font-display font-semibold leading-snug text-text">{item.title}</span>
                  <span className="text-[0.6875rem] font-medium text-text-muted">
                    {CALENDAR_ITEM_LABEL[item.type]} &middot; {item.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </span>
                {hasCalendarStatus(item.type) && <StatusChip status={calendarItemState(item)} className="shrink-0" />}
                <ChevronRight size={16} strokeWidth={2.5} className="hidden sm:block shrink-0 text-text-light transition-colors duration-200 group-hover:text-primary-500" />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
