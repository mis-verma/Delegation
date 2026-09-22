import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CalendarClock, AlertTriangle, CalendarDays, Inbox } from 'lucide-react';
import { EntityIconTile } from '../../components';
import { Modal } from '../../components/modal';
import { Skeleton } from '../../components/skeleton';
import { Badge, type badgeVariants } from '../../components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import { useAuth } from '../../context/AuthContext';
import { useTasksQuery } from '../tasks/hook';
import { useTicketsBoardQuery } from '../tickets/hook';
import { useMyChecklistInstancesQuery } from '../checklist/hook';
import { useEventsQuery } from '../events/hook';
import { instanceDeadline } from '../checklist/checklistDisplay';
import { StatCard } from '../dashboard';
import {
  buildMonthGrid,
  dayKey,
  isSameCalendarDay,
  WEEKDAY_LABELS,
  CALENDAR_ITEM_LABEL,
  CALENDAR_ITEM_ICON,
  CALENDAR_ITEM_DOT_CLASS,
  CALENDAR_ITEM_TINT_CLASS,
  type CalendarItem,
  type CalendarItemType,
} from './calendarDisplay';

const STATUS_VARIANT = { completed: 'success', overdue: 'destructive', pending: 'warning' } as const satisfies Record<string, NonNullable<VariantProps<typeof badgeVariants>['variant']>>;
const STATUS_TINT = { completed: 'bg-success/10', overdue: 'bg-danger/10', pending: 'bg-warning/10' } as const;
const STATUS_LABEL = { completed: 'Completed', overdue: 'Overdue', pending: 'Pending' } as const;

// Checklist instances have no org-wide query yet (see HomePage.tsx's own comment on the same gap)
// — they stay "mine" for every role, same as the Dashboard. Tasks and Tickets go org-wide for
// ADMIN/PC, personal otherwise; Events are global to begin with.
const MAX_DOTS_PER_DAY = 3;

export const CalendarPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOrgWideRole = user?.role === 'ADMIN' || user?.role === 'PC';

  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // "now" only needs to be approximately current for the overdue checks and "today" highlight
  // below — memoized so it's read once per mount, same pattern HomePage.tsx uses for the same
  // reason (calling Date.now()/new Date() directly in a render-path memo is impure).
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);
  const today = useMemo(() => new Date(now), [now]);

  const { data: allTasks, isPending: tasksPending, isError: tasksFailed } = useTasksQuery();
  const { data: allTickets, isPending: ticketsPending, isError: ticketsFailed } = useTicketsBoardQuery();
  const { data: instances = [], isPending: instancesPending } = useMyChecklistInstancesQuery({}, { limit: 200 });
  const { data: events, isPending: eventsPending } = useEventsQuery();

  const isPending = tasksPending || ticketsPending || instancesPending || eventsPending;
  const isError = tasksFailed || ticketsFailed;

  const items = useMemo<CalendarItem[]>(() => {
    const out: CalendarItem[] = [];

    const tasks = allTasks ?? [];
    for (const t of tasks) {
      if (!t.dueDate) continue;
      if (!isOrgWideRole && t.userId !== user?.id && t.assigneeId !== user?.id && !t.additionalAssigneeIds?.includes(user?.id ?? '')) continue;
      const d = new Date(t.dueDate);
      out.push({
        id: `task-${t.id}`,
        title: t.title,
        type: 'delegation',
        date: d,
        completed: t.status === 'done',
        overdue: t.status !== 'done' && d.getTime() < now,
        link: '/tasks',
      });
    }

    const tickets = allTickets ?? [];
    for (const tk of tickets) {
      if (!tk.tatDueAt) continue;
      if (!isOrgWideRole && tk.userId !== user?.id && tk.assigneeId !== user?.id) continue;
      const d = new Date(tk.tatDueAt);
      out.push({
        id: `ticket-${tk.id}`,
        title: tk.title,
        type: 'ticket',
        date: d,
        completed: tk.status === 'CLOSED',
        overdue: tk.status !== 'CLOSED' && d.getTime() < now,
        link: '/tickets',
      });
    }

    for (const inst of instances) {
      const deadlineMs = instanceDeadline(inst);
      const d = new Date(deadlineMs);
      out.push({
        id: `checklist-${inst.id}`,
        title: inst.title,
        type: 'checklist',
        date: d,
        completed: inst.verificationStatus === 'APPROVED',
        overdue: inst.verificationStatus !== 'APPROVED' && deadlineMs < now,
        link: `/checklists/${inst.id}`,
      });
    }

    for (const e of events ?? []) {
      out.push({
        id: `event-${e.id}`,
        title: e.title,
        // Deadline/Announcement/Broadcast, not one flat "event" bucket — see calendarDisplay.ts.
        type: e.type,
        date: new Date(e.eventDate),
        completed: false,
        overdue: false,
        link: '/events',
      });
    }

    return out;
  }, [allTasks, allTickets, instances, events, isOrgWideRole, user?.id, now]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = dayKey(item.date);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // A quick "how busy does this look" read, same KPI-strip convention every other list page
  // (Tickets, Tasks) already uses — "This month" follows whichever month is being browsed, while
  // Today/This week stay pinned to the real today regardless of which month is on screen.
  const stats = useMemo(() => {
    const inMonth = items.filter((i) => i.date.getFullYear() === year && i.date.getMonth() === month);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return {
      inMonth: inMonth.length,
      overdueInMonth: inMonth.filter((i) => i.overdue).length,
      dueToday: itemsByDay.get(dayKey(today))?.length ?? 0,
      dueThisWeek: items.filter((i) => i.date >= weekStart && i.date < weekEnd).length,
    };
  }, [items, itemsByDay, year, month, today]);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const selectedItems = useMemo(
    () => (selectedDay ? [...(itemsByDay.get(dayKey(selectedDay)) ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime()) : []),
    [selectedDay, itemsByDay],
  );

  const goToMonth = (delta: number) => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  const goToToday = () => setCursor(new Date());

  const openItem = (link: string) => {
    setSelectedDay(null);
    navigate(link);
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 ease-out">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <EntityIconTile icon={CalendarIcon} />
          <div>
            <h1 className="text-lg sm:text-xl font-display font-bold text-text tracking-tight">Calendar</h1>
            <p className="text-xs sm:text-[13px] font-medium text-text-muted mt-0.5">
              Every delegation, ticket, checklist, and event due date in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="h-9 px-3.5 rounded-xl border border-border bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border-hover transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Today
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              aria-label="Previous month"
              className="flex items-center justify-center size-8 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <span className="text-sm font-display font-bold text-text tabular-nums px-2 min-w-[9rem] text-center">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              aria-label="Next month"
              className="flex items-center justify-center size-8 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {isError && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-text-secondary">
          Some delegations or tickets couldn&rsquo;t load — the dates shown below may be incomplete.
        </div>
      )}

      {/* Single column on phones — same fix as OrgSnapshotStrip: at 2-up, a long label
          ("September 2026", "Overdue") has no room to wrap at a word boundary and breaks
          mid-word. Two-up only once there's width for it (sm), four-up on desktop. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          icon={CalendarIcon}
          label="This month"
          value={isPending ? '—' : stats.inMonth}
          caption={monthLabel}
          highlight
          decorative
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={isPending ? '—' : stats.overdueInMonth}
          caption="This month"
          iconBgTint="bg-danger/10"
          iconTint="text-danger"
        />
        <StatCard
          icon={CalendarClock}
          label="Due today"
          value={isPending ? '—' : stats.dueToday}
          caption={today.toLocaleDateString(undefined, { weekday: 'long' })}
          iconBgTint="bg-coral-50 dark:bg-coral-500/10"
          iconTint="text-coral-600 dark:text-coral-400"
        />
        <StatCard
          icon={CalendarDays}
          label="Due this week"
          value={isPending ? '—' : stats.dueThisWeek}
          caption="Sun – Sat"
          iconBgTint="bg-primary-50 dark:bg-primary-500/10"
          iconTint="text-primary-600 dark:text-primary-400"
        />
      </div>

      {/* Legend — a small icon per type, not just a colored dot, so what's on the grid is
          identifiable at a glance instead of requiring the color-to-meaning key to be memorized. */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(CALENDAR_ITEM_LABEL) as CalendarItemType[]).map((type) => {
          const Icon = CALENDAR_ITEM_ICON[type];
          return (
            <div
              key={type}
              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-border/60 bg-surface"
            >
              {/* Solid dot color + white icon, matching the day panel — the pale tint made
                  Delegation/Ticket/Checklist nearly indistinguishable from each other here too. */}
              <span className={`flex items-center justify-center size-5 rounded-full shrink-0 text-white ${CALENDAR_ITEM_DOT_CLASS[type]}`}>
                <Icon size={10} strokeWidth={2.75} />
              </span>
              <span className="text-[11px] font-display font-semibold text-text-secondary">{CALENDAR_ITEM_LABEL[type]}</span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border/60">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2.5 text-center text-[11px] font-display font-bold text-text-muted tracking-wide">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((date, i) => {
            const inMonth = date.getMonth() === month;
            const isToday = isSameCalendarDay(date, today);
            const dayItems = itemsByDay.get(dayKey(date)) ?? [];
            const visibleDots = dayItems.slice(0, MAX_DOTS_PER_DAY);
            const overflow = dayItems.length - visibleDots.length;

            return (
              <button
                key={i}
                type="button"
                onClick={() => dayItems.length > 0 && setSelectedDay(date)}
                disabled={dayItems.length === 0}
                aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${dayItems.length ? `, ${dayItems.length} due` : ''}`}
                className={`group relative flex flex-col items-start gap-1.5 min-h-[4.5rem] sm:min-h-28 p-1.5 sm:p-2.5 border-b border-r border-border/40 [&:nth-child(7n)]:border-r-0 text-left transition-colors duration-150 ${
                  dayItems.length > 0 ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default'
                } ${inMonth ? 'bg-surface' : 'bg-surface-hover/30'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40`}
              >
                <span
                  className={`inline-flex items-center justify-center size-8 sm:size-9 rounded-full text-sm sm:text-base font-display font-bold tabular-nums transition-colors ${
                    isToday
                      ? 'bg-primary-600 text-white ring-4 ring-primary-500/15'
                      : inMonth
                        ? 'text-text'
                        : 'text-text-light'
                  }`}
                >
                  {date.getDate()}
                </span>

                {dayItems.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {visibleDots.map((item) => (
                        <span
                          key={item.id}
                          className={`size-1.5 sm:size-2 rounded-full shrink-0 ${CALENDAR_ITEM_DOT_CLASS[item.type]} ${item.overdue ? 'ring-2 ring-danger/30' : ''}`}
                          title={item.title}
                        />
                      ))}
                      {overflow > 0 && (
                        <span className="text-[10px] font-display font-bold text-text-light">+{overflow}</span>
                      )}
                    </div>
                    {/* The count in words, not just dots — a glance answer to "how much is due
                        here" without having to count colored circles. */}
                    <span className="hidden sm:block text-[10px] font-display font-semibold text-text-muted">
                      {dayItems.length} due
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Modal
        open={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={selectedDay?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) ?? ''}
        description={`${selectedItems.length} due this day`}
        icon={<CalendarIcon size={17} strokeWidth={2.5} />}
        size="md"
        bodyClassName="gap-2"
      >
        {isPending ? (
          <div className="flex flex-col gap-2 -mx-1">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[3.75rem] rounded-xl" />
            ))}
          </div>
        ) : selectedItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex items-center justify-center size-11 rounded-full bg-surface-hover border border-border/50">
              <Inbox size={18} className="text-text-light" />
            </div>
            <p className="text-sm font-medium text-text-muted max-w-[18rem]">Nothing due this day.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 -mx-1">
            {selectedItems.map((item) => {
              const Icon = CALENDAR_ITEM_ICON[item.type];
              const state = item.completed ? 'completed' : item.overdue ? 'overdue' : 'pending';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item.link)}
                  className="group flex items-center gap-3 rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface px-3.5 py-3 text-left transition-all duration-200 ease-in-out hover:border-primary-500/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
                >
                  {/* Solid color, not the pale tint — Delegation/Ticket/Checklist's tints (three
                      close navy shades) read as nearly the same color at this size, which was
                      exactly the "how do I tell what this is" confusion. The dot colors from the
                      grid (properly distinct: primary-500/700/900, rose, gold, amber) carry over
                      here as a solid fill with a white icon instead. */}
                  <span className={`flex items-center justify-center size-10 rounded-xl shrink-0 text-white transition-transform duration-200 ease-in-out group-hover:scale-105 ${CALENDAR_ITEM_DOT_CLASS[item.type]}`}>
                    <Icon size={17} strokeWidth={2.25} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-text truncate">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="outline" className={`text-[10px] ${CALENDAR_ITEM_TINT_CLASS[item.type]}`}>
                        {CALENDAR_ITEM_LABEL[item.type]}
                      </Badge>
                      <span className="text-[11px] font-medium text-text-light">
                        {item.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[state]} className={`shrink-0 ${STATUS_TINT[state]}`}>
                    {STATUS_LABEL[state]}
                  </Badge>
                  <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-light group-hover:text-primary-500 transition-colors duration-200" />
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};
