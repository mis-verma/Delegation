import { useRef, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { CalendarAddMenu } from './CalendarAddMenu';
import {
  dayKey,
  isSameCalendarDay,
  WEEKDAY_LABELS,
  CALENDAR_ITEM_LABEL,
  CALENDAR_ITEM_DOT_CLASS,
  type CalendarCreateKind,
  type CalendarItem,
  type CalendarItemType,
} from './calendarDisplay';

const MAX_DOTS_PER_DAY = 3;
const MAX_CHIPS_PER_DAY = 2;

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

// Cells react to the width of the calendar card itself (a container query), not the viewport:
// side by side with the agenda on a laptop the card is narrower than on a tablet, and the same
// cell has to pick dots or chips by the room it really has. `@min-[38rem]` = roughly 87px per
// day; it is written out literally everywhere below because Tailwind only picks up class names it
// can read as plain text.

interface CalendarGridProps {
  /** The fixed 42-day grid from buildMonthGrid. */
  days: Date[];
  month: number;
  today: Date;
  selectedDay: Date;
  itemsByDay: Map<string, CalendarItem[]>;
  onSelect: (day: Date) => void;
  onCreate: (kind: CalendarCreateKind, day: Date) => void;
}

export const CalendarGrid = ({ days, month, today, selectedDay, itemsByDay, onSelect, onCreate }: CalendarGridProps) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectedKey = dayKey(selectedDay);

  // Arrow keys walk the days (roving tabindex: only the selected day is a tab stop). Moving past
  // the first or last cell is fine, selecting that date flips the month and the same key exists
  // in the rebuilt grid to take focus.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = (e.target as HTMLElement).dataset.day;
    const step = KEY_STEPS[e.key] as number | undefined;
    if (!current || step === undefined) return;
    const from = days.find((d) => dayKey(d) === current);
    if (!from) return;
    e.preventDefault();
    const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + step);
    onSelect(next);
    requestAnimationFrame(() => {
      bodyRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(next)}"]`)?.focus();
    });
  };

  return (
    <div className="@container rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`py-1.5 @min-[38rem]:py-2 text-center text-[0.6875rem] @min-[38rem]:t-meta font-display font-semibold tracking-wide ${i === 0 || i === 6 ? 'text-text-light' : 'text-text-muted'}`}
          >
            {label}
          </div>
        ))}
      </div>

      <div ref={bodyRef} onKeyDown={onKeyDown} role="group" aria-label="Days of the month" className="grid grid-cols-7">
        {days.map((date) => {
          const key = dayKey(date);
          const inMonth = date.getMonth() === month;
          const isToday = isSameCalendarDay(date, today);
          const isSelected = key === selectedKey;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const dayItems = itemsByDay.get(key) ?? [];
          const dots = dayItems.slice(0, MAX_DOTS_PER_DAY);
          const dotOverflow = dayItems.length - dots.length;
          const chips = dayItems.slice(0, MAX_CHIPS_PER_DAY);
          const chipOverflow = dayItems.length - chips.length;
          const longDate = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
          const quiet = !inMonth || isWeekend;

          return (
            <div
              key={key}
              // Narrow (phone): no cell lines, like a calendar app. Wide: the ruled month grid.
              className={`group relative @min-[38rem]:border-b @min-[38rem]:border-r border-border/50 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 ${
                isSelected ? 'z-10' : ''
              }`}
            >
              <button
                type="button"
                data-day={key}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelect(date)}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${longDate}, ${dayItems.length === 0 ? 'nothing due' : `${dayItems.length} ${dayItems.length === 1 ? 'item' : 'items'}`}${isToday ? ', today' : ''}`}
                className={`flex h-12 @min-[38rem]:h-auto @min-[38rem]:min-h-24 w-full flex-col items-center @min-[38rem]:items-stretch gap-0.5 @min-[38rem]:gap-1 p-1 @min-[38rem]:p-1.5 text-left cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${
                  isSelected
                    ? '@min-[38rem]:bg-primary-500/10 @min-[38rem]:ring-2 @min-[38rem]:ring-inset @min-[38rem]:ring-primary-500'
                    : quiet
                      ? '@min-[38rem]:bg-surface-hover/40 hover:bg-surface-hover'
                      : 'bg-surface hover:bg-surface-hover'
                }`}
              >
                <span className={`flex @min-[38rem]:justify-start justify-center`}>
                  <span
                    // The picked day is a filled circle; today, when it isn't picked, is a blue number with a soft ring (app style).
                    className={`inline-flex items-center justify-center size-7 rounded-full text-[0.8125rem] @min-[38rem]:text-sm font-display font-semibold tabular-nums transition-colors duration-150 ${
                      isSelected
                        ? 'bg-primary-600 text-white'
                        : isToday
                          ? 'text-primary-700 dark:text-primary-300 font-bold ring-1 ring-inset ring-primary-500/50'
                          : inMonth
                            ? isWeekend
                              ? 'text-text-muted'
                              : 'text-text'
                            : 'text-text-light'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </span>

                {dayItems.length > 0 && (
                  <>
                    {/* Narrow cells: colour dots only, up to three plus a count. */}
                    <span className={`flex items-center justify-center gap-1 @min-[38rem]:hidden ${inMonth ? '' : 'opacity-60'}`}>
                      {dots.map((item) => (
                        <span
                          key={item.id}
                          className={`size-1.5 rounded-full shrink-0 ${CALENDAR_ITEM_DOT_CLASS[item.type]} ${item.overdue ? 'ring-2 ring-danger/40' : ''}`}
                        />
                      ))}
                      {dotOverflow > 0 && <span className="t-meta font-display font-bold leading-none text-text-muted">+{dotOverflow}</span>}
                    </span>

                    {/* Roomy cells: two small chips with the real titles, then "+N more". */}
                    <span className={`hidden @min-[38rem]:flex flex-col gap-1 min-w-0 ${inMonth ? '' : 'opacity-60'}`}>
                      {chips.map((item) => (
                        <span
                          key={item.id}
                          className={`flex items-center gap-1.5 min-w-0 h-5 px-1.5 rounded-md t-meta font-medium ${
                            item.overdue ? 'bg-danger/10 text-danger' : 'bg-surface-hover text-text-secondary'
                          }`}
                        >
                          <span className={`size-1.5 rounded-full shrink-0 ${CALENDAR_ITEM_DOT_CLASS[item.type]}`} />
                          <span className="truncate">{item.title}</span>
                        </span>
                      ))}
                      {chipOverflow > 0 && (
                        <span className="px-1.5 t-meta font-display font-semibold text-text-muted">+{chipOverflow} more</span>
                      )}
                    </span>
                  </>
                )}
              </button>

              {/* Quick add: a real sibling button (never nested in the day button). Only the
                  selected day keeps it in the tab order, so keyboard users get one extra stop
                  rather than 42. */}
              <CalendarAddMenu
                align="start"
                onPick={(kind) => onCreate(kind, date)}
                trigger={
                  <button
                    type="button"
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={`Add to ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
                    className={`absolute top-1 right-1 hidden @min-[38rem]:flex items-center justify-center size-6 rounded-md border border-border bg-surface text-text-muted hover:text-primary-600 hover:border-primary-500/50 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 ${
                      isSelected ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                }
              />
            </div>
          );
        })}
      </div>

      {/* The key: one small line of coloured dots and names. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-3 py-2">
        {(Object.keys(CALENDAR_ITEM_LABEL) as CalendarItemType[]).map((type) => (
          <span key={type} className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-text-muted">
            <span className={`size-1.5 rounded-full ${CALENDAR_ITEM_DOT_CLASS[type]}`} aria-hidden="true" />
            {CALENDAR_ITEM_LABEL[type]}
          </span>
        ))}
      </div>
    </div>
  );
};
