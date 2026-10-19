import { lazy, Suspense, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { EntityIconTile, FormChunkFallback } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useTasksQuery } from '../tasks/hook';
import { useTicketsBoardQuery } from '../tickets/hook';
import { useMyChecklistInstancesQuery } from '../checklist/hook';
import { useEventsQuery } from '../events/hook';
import { instanceDeadline } from '../checklist/checklistDisplay';
import { CalendarStats } from './CalendarStats';
import { CalendarGrid } from './CalendarGrid';
import { CalendarAgenda } from './CalendarAgenda';
import { CalendarMonthPicker } from './CalendarMonthPicker';
import { buildMonthGrid, dayKey, defaultDueFor, type CalendarCreateKind, type CalendarItem } from './calendarDisplay';

const TaskForm = lazy(() => import('../tasks/TaskForm').then((m) => ({ default: m.TaskForm })));
const TicketForm = lazy(() => import('../tickets/TicketForm').then((m) => ({ default: m.TicketForm })));

const NAV_BUTTON =
  'flex items-center justify-center size-9 pointer-coarse:size-10 shrink-0 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50';

export const CalendarPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOrgWideRole = user?.role === 'ADMIN' || user?.role === 'PC';

  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

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

  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const selectedItems = useMemo(
    () => [...(itemsByDay.get(dayKey(selectedDay)) ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [selectedDay, itemsByDay],
  );

  const selectDay = (date: Date) => {
    setSelectedDay(date);
    if (date.getFullYear() !== year || date.getMonth() !== month) setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const showMonth = (target: Date) => {
    setCursor(target);
    const real = new Date();
    const isThisMonth = target.getFullYear() === real.getFullYear() && target.getMonth() === real.getMonth();
    setSelectedDay(isThisMonth ? real : new Date(target.getFullYear(), target.getMonth(), 1));
  };
  const goToMonth = (delta: number) => showMonth(new Date(year, month + delta, 1));
  const goToToday = () => showMonth(new Date());

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: TouchEvent) => { const t = e.touches[0]; swipe.current = t ? { x: t.clientX, y: t.clientY } : null; };
  const onSwipeEnd = (e: TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goToMonth(dx < 0 ? 1 : -1);
  };

  const [creating, setCreating] = useState<{ kind: CalendarCreateKind; due: Date | undefined } | null>(null);
  const startCreate = (kind: CalendarCreateKind, day: Date) => {
    selectDay(day);
    setCreating({ kind, due: defaultDueFor(day, Date.now()) });
  };
  const closeForm = () => setCreating(null);

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-6 w-full animate-in fade-in duration-500 ease-out">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <EntityIconTile icon={CalendarIcon} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-lg sm:text-xl font-display font-bold text-text tracking-tight">Calendar</h1>
          </div>
        </div>

        <nav aria-label="Month" className="flex items-center gap-2">
          <div className="flex flex-1 sm:flex-none items-center gap-0.5 rounded-xl border border-border/60 bg-surface p-0.5">
            <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month" className={NAV_BUTTON}>
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <CalendarMonthPicker label={monthLabel} year={year} month={month} onPick={(y, m) => showMonth(new Date(y, m, 1))} />
            <button type="button" onClick={() => goToMonth(1)} aria-label="Next month" className={NAV_BUTTON}>
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
          <button
            type="button"
            onClick={goToToday}
            className="h-10 sm:h-9 shrink-0 px-3 rounded-xl border border-primary-500/25 bg-primary-500/[0.08] t-meta font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-surface-hover hover:border-border-hover transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
          >
            Today
          </button>
        </nav>
      </header>

      {isError && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-text-secondary">
          Some delegations or tickets didn&rsquo;t load, so the dates below may be incomplete.
        </div>
      )}

      <CalendarStats
        stats={stats}
        isPending={isPending}
        monthLabel={monthLabel}
        todayWeekday={today.toLocaleDateString(undefined, { weekday: 'long' })}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
        <div className="min-w-0 touch-pan-y" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          <CalendarGrid
            days={grid}
            month={month}
            today={today}
            selectedDay={selectedDay}
            itemsByDay={itemsByDay}
            onSelect={selectDay}
            onCreate={startCreate}
          />
        </div>

        <CalendarAgenda
          day={selectedDay}
          today={today}
          items={selectedItems}
          isPending={isPending}
          onOpenItem={(link) => navigate(link)}
          onCreate={(kind) => startCreate(kind, selectedDay)}
        />
      </div>

      <Suspense fallback={<FormChunkFallback />}>
        {creating?.kind === 'delegation' && <TaskForm onClose={closeForm} defaultDueDate={creating.due} />}
        {creating?.kind === 'ticket' && <TicketForm onClose={closeForm} defaultDueDate={creating.due} />}
      </Suspense>
    </div>
  );
};
