import { memo, useMemo } from 'react';
import { PRIORITY_CONFIG } from './ticketDisplay';
import type { Ticket } from '../../api/ticket';

interface TicketTimelineProps {
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
}

const DAY_MS = 86_400_000;
const startOfDay = (value: string | Date) => new Date(value).setHours(0, 0, 0, 0);

/**
 * Minimum column width per day. A short span stretches to fill the card (no empty strip to the
 * right on a wide screen); a long one holds this floor so day numbers stay readable and scrolls.
 */
const DAY_WIDTH_REM = 3.25;
/** Beyond this the axis is unreadable at any width, so the span is clamped and the rest scrolls. */
const MAX_DAYS = 45;

/** Label column: narrower on phones and tablets so the chart keeps room, wider where titles fit. */
const LABEL_WIDTH = 'w-44 sm:w-52 lg:w-64 xl:w-72';

type Bar = {
  ticket: Ticket;
  /** Whole days from the axis start to the bar's first day. */
  offset: number;
  /** Bar length in days; always at least 1 so a same-day ticket is still visible. */
  span: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

/**
 * The ticket Gantt: one row per ticket, bars placed and sized on a shared day axis.
 *
 * A bar runs from the ticket's creation to its TAT due date. Ticket has no `startDate` field at
 * all (unlike Task), so the bar always starts at `createdAt` — that is when the clock actually
 * started. A ticket with no `tatDueAt` has no end and therefore no bar; those are listed under the
 * chart rather than dropped, since "nobody has a target date for this" is exactly the thing a
 * timeline should surface.
 *
 * Bar colour is priority, matching the dot in List/Board, so the same ticket reads the same way
 * everywhere. Overdue is stated as a word on the row (driven by the server-computed `isOverdue`
 * flag, same as everywhere else in Ticket's UI) rather than a second bar colour.
 */
const TicketTimelineComponent = ({ tickets, onOpen }: TicketTimelineProps) => {
  const { days, bars, undated } = useMemo(() => {
    const scheduled = tickets.filter((t) => !!t.tatDueAt);
    const unscheduled = tickets.filter((t) => !t.tatDueAt);

    if (scheduled.length === 0) {
      return { days: [] as Date[], bars: [] as Bar[], undated: unscheduled };
    }

    const barStart = (t: Ticket) => startOfDay(t.createdAt);
    const barEnd = (t: Ticket) => startOfDay(t.tatDueAt!);

    // Axis starts at the earliest of (earliest bar start, today) so "today" is always locatable,
    // and ends at the latest due date.
    let axisStart = Math.min(...scheduled.map(barStart), startOfDay(new Date()));
    const axisEnd = Math.max(...scheduled.map(barEnd));

    let total = Math.floor((axisEnd - axisStart) / DAY_MS) + 1;
    if (total > MAX_DAYS) {
      // Keep the most recent window: a year-old ticket shouldn't compress everything current into
      // two pixels.
      axisStart = axisEnd - (MAX_DAYS - 1) * DAY_MS;
      total = MAX_DAYS;
    }

    const axisDays = Array.from({ length: total }, (_, i) => new Date(axisStart + i * DAY_MS));

    const placed: Bar[] = scheduled.map((ticket) => {
      const rawStart = barStart(ticket);
      const rawEnd = barEnd(ticket);
      const clampedStart = Math.max(rawStart, axisStart);
      // A due date before creation is bad data, not a negative-width bar — treat the bar as
      // ending on its start day.
      const clampedEnd = Math.min(Math.max(rawEnd, clampedStart), axisStart + (total - 1) * DAY_MS);

      return {
        ticket,
        offset: Math.floor((clampedStart - axisStart) / DAY_MS),
        span: Math.floor((clampedEnd - clampedStart) / DAY_MS) + 1,
        clippedStart: rawStart < axisStart,
        clippedEnd: rawEnd > axisStart + (total - 1) * DAY_MS,
      };
    });

    return { days: axisDays, bars: placed, undated: unscheduled };
  }, [tickets]);

  const todayIndex = days.findIndex((d) => startOfDay(d) === startOfDay(new Date()));
  const chartMinWidth = `${days.length * DAY_WIDTH_REM}rem`;
  const ownerName = (ticket: Ticket) => ticket.assignee?.firstName ?? 'Unassigned';

  return (
    <div className="flex flex-col gap-4">
      {days.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap px-1">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Ticket['priority'][]).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span aria-hidden className={`w-4 h-2.5 rounded-sm ${PRIORITY_CONFIG[key].bar}`} />
              <span className="text-[11px] font-semibold text-text-muted tracking-tight">
                {PRIORITY_CONFIG[key].label}
              </span>
            </span>
          ))}
          <span className="text-[11px] font-semibold text-danger tracking-tight">
            Overdue is labelled on the row
          </span>
        </div>
      )}

      {days.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-fit">
              <div className="flex sticky top-0 z-20 bg-primary-800">
                <div className={`sticky left-0 z-30 ${LABEL_WIDTH} shrink-0 px-3 py-2.5 bg-primary-800`}>
                  <span className="text-xs font-semibold text-white tracking-tight">Ticket</span>
                </div>
                <div className="flex flex-1" style={{ minWidth: chartMinWidth }}>
                  {days.map((day, index) => (
                    <div
                      key={day.toISOString()}
                      className={`flex-1 basis-0 min-w-0 px-1 py-2.5 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                        index === todayIndex ? 'text-white' : 'text-white/60'
                      }`}
                    >
                      {index === 0 || day.getDate() === 1
                        ? day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                        : day.getDate()}
                    </div>
                  ))}
                </div>
              </div>

              <ul className="flex flex-col">
                {bars.map(({ ticket, offset, span, clippedStart, clippedEnd }) => {
                  const priority = PRIORITY_CONFIG[ticket.priority];
                  const overdue = ticket.isOverdue && ticket.status !== 'CLOSED';

                  return (
                    <li key={ticket.id} className="flex border-t border-border/40">
                      <div className={`sticky left-0 z-10 ${LABEL_WIDTH} shrink-0 flex items-center gap-2 px-3 py-2.5 bg-surface`}>
                        <span aria-hidden className={`w-1 self-stretch rounded-full shrink-0 ${priority.bar}`} />
                        <button
                          type="button"
                          onClick={() => onOpen(ticket)}
                          className="flex flex-col min-w-0 text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 ease-in-out"
                        >
                          <span className="text-xs font-semibold text-text-secondary tracking-tight leading-snug line-clamp-2 break-words">
                            {ticket.title}
                          </span>
                          <span className="text-[10px] font-medium break-words">
                            {overdue ? (
                              <span className="text-danger font-semibold">Delayed</span>
                            ) : (
                              <span className="text-text-muted">{ownerName(ticket)}</span>
                            )}
                          </span>
                        </button>
                      </div>

                      <div className="relative flex-1 py-3" style={{ minWidth: chartMinWidth }}>
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-5 flex">
                          {days.map((day, index) => (
                            <div
                              key={day.toISOString()}
                              className={`flex-1 basis-0 min-w-0 h-full ${
                                index === todayIndex ? 'bg-primary-500/20' : 'bg-surface-hover/60'
                              }`}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpen(ticket)}
                          title={`${ticket.title} — ${priority.label} priority${overdue ? ', overdue' : ''}${
                            clippedStart || clippedEnd ? '. Extends beyond the visible range.' : ''
                          }`}
                          className={`absolute top-1/2 -translate-y-1/2 h-5 ${priority.bar} cursor-pointer transition-all duration-200 ease-in-out hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
                            clippedStart ? '' : 'rounded-l-md'
                          } ${clippedEnd ? '' : 'rounded-r-md'}`}
                          style={{
                            left: `${(offset / days.length) * 100}%`,
                            width: `${(span / days.length) * 100}%`,
                          }}
                        >
                          <span className="sr-only">
                            {`Open ${ticket.title}, ${priority.label} priority, due ${new Date(ticket.tatDueAt!).toDateString()}`}
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <section className="flex flex-col gap-2">
          <header className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-text-secondary tracking-tight">No due date</h3>
            <span className="text-xs font-semibold text-text-muted tabular-nums">{undated.length}</span>
            <span className="flex-1 h-px bg-border/50" />
          </header>

          <ul className="flex flex-col rounded-lg border border-border/60 overflow-hidden">
            {undated.map((ticket) => (
              <li key={ticket.id} className="border-t border-border/40 first:border-t-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(ticket)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(ticket);
                    }
                  }}
                  className="relative flex items-center gap-3 pl-4 pr-3 py-2.5 pointer-coarse:py-3 bg-surface hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none transition-colors duration-200 ease-in-out cursor-pointer"
                >
                  <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_CONFIG[ticket.priority].bar}`} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-text-secondary tracking-tight leading-snug line-clamp-2 break-words">
                      {ticket.title}
                    </span>
                    <span className="text-[10px] font-medium text-text-muted break-words">
                      {ownerName(ticket)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export const TicketTimeline = memo(TicketTimelineComponent);
