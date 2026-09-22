import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, ListChecks } from 'lucide-react';
import { Button, Fab } from '../../components';
import { TodoList } from './TodoList';
import { TodoQuickStats, type TodoQuickFilterKey } from './TodoQuickStats';
import { TodoToolbar } from './TodoToolbar';
import type { TodoPriorityFilter, TodoSortKey } from './todoSort';
import { TODO_QUICK_FILTER_PREDICATES } from './todoQuickFilters';
import { TODO_BUTTON_CLASS } from './todoFormStyles';
import { CreateTodoModal } from './CreateTodoModal';
import { useTodosQuery } from './hook';
import { readQuickFilterParam } from '../../lib/readQuickFilterParam';

const QUICK_FILTER_VALUES = ['pending', 'completed', 'due', 'delayed'] as const;

export const TodoPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  // Seeded from `?quickFilter=` when present (e.g. the Dashboard's "Due"/"Completed" rows
  // deep-linking in as `/todo?quickFilter=pending` or `?quickFilter=completed`) — TodoPage had no
  // URL-tracked state before this, so this is the minimal read-once-on-mount addition.
  const [quickFilter, setQuickFilter] = useState<TodoQuickFilterKey | null>(
    () => readQuickFilterParam(searchParams, QUICK_FILTER_VALUES),
  );
  const [priority, setPriority] = useState<TodoPriorityFilter>('all');
  // Defaults to 'created' — newest first — which is exactly what the server already returns
  // (`orderBy(desc(createdAt))`), so adding the sort control didn't silently reorder anyone's
  // list. Due-date order is one click away for whoever wants it.
  const [sort, setSort] = useState<TodoSortKey>('created');
  // Same query key as TodoList, so this is served from cache, not a second network round-trip —
  // needed here to feed the quick-stat tile counts.
  const { data: todos = [], isPending } = useTodosQuery();

  // The sidebar's "+" quick-create link has no route of its own to land on (CreateTodoModal opens
  // from local state, not a route), so it deep-links here as `/todo?create=1` instead — same
  // one-shot-param pattern TaskList/TicketList use for their own `?create=1` handling, the param
  // stripped right after so it doesn't reopen on every render.
  useEffect(() => {
    if (!searchParams.get('create')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowForm(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('create');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const toggleQuickFilter = (key: TodoQuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
  };

  const quickCounts = {
    pending: todos.filter(TODO_QUICK_FILTER_PREDICATES.pending).length,
    completed: todos.filter(TODO_QUICK_FILTER_PREDICATES.completed).length,
    due: todos.filter(TODO_QUICK_FILTER_PREDICATES.due).length,
    delayed: todos.filter(TODO_QUICK_FILTER_PREDICATES.delayed).length,
  };

  // Mirrors TodoList's own quick-filter narrowing so the header count always matches what's
  // actually rendered below it. Same cached `todos` array, so no extra request.
  const quickFiltered = quickFilter ? todos.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : todos;
  const shownCount =
    priority === 'all' ? quickFiltered.length : quickFiltered.filter((t) => t.priority === priority).length;

  return (
    // gap-6, matching the other three top-level pages — this was the only one on gap-5.
    <div className="flex flex-col gap-6 mx-auto w-full max-w-(--container-width) transition-all duration-300">
      {/* Same header treatment as Delegation and Tickets: no visible title block — the sidebar
          item that got you here already says To-Do, and the lead "Total" tile carries the count.
          The heading stays in the accessibility tree as the page's one landmark. */}
      <h1 className="sr-only">To-Do</h1>

      <Fab actions={[{ key: 'add', label: 'Add todo', icon: Plus, onClick: () => setShowForm(true) }]} />

      <TodoQuickStats
        counts={quickCounts}
        total={todos.length}
        active={quickFilter}
        onToggle={toggleQuickFilter}
        onClear={() => setQuickFilter(null)}
        isLoading={isPending}
      />

      {/* Controls band below the stats, matching the other two pages. Desktop: inline button.
          Mobile: the Fab above instead — same single "Add todo" action. */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" variant="primary" className={`hidden md:inline-flex gap-1.5 ml-auto ${TODO_BUTTON_CLASS}`} onClick={() => setShowForm(true)}>
          <Plus size={14} />
          Todo Task
        </Button>
      </div>

      <section aria-label="Your to-dos" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center size-6 rounded-md bg-primary-700/10 text-primary-700 dark:text-primary-300 shrink-0">
            <ListChecks size={13} strokeWidth={2.25} />
          </span>
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="text-sm font-display font-semibold text-text tracking-tight truncate">All tasks</p>
            <span className="text-xs font-display font-medium text-text-muted tabular-nums shrink-0">
              {shownCount === 1 ? '1 task' : `${shownCount} tasks`}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-border/60">
          <TodoToolbar priority={priority} onPriorityChange={setPriority} sort={sort} onSortChange={setSort} />
        </div>
      </section>

      <TodoList quickFilter={quickFilter} priority={priority} sort={sort} />

      <CreateTodoModal open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
};
