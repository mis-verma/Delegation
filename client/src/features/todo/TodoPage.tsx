import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Flag, ArrowUpDown, X } from 'lucide-react';
import { Fab } from '../../components';
import { ChipLegend, type ChipLegendSection } from '../../components/chipLegend';
import { CreatedRangeBanner, CreatedRangePicker } from '../../components/createdRangeBanner';
import { useCreatedRange, useDueRange } from '../../lib/createdRange';
import {
  OptionsSheet, OptionSection, OptionSegmented, ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear,
} from '../../components/optionsSheet';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { TodoList } from './TodoList';
import { TodoQuickStats, type TodoQuickFilterKey } from './TodoQuickStats';
import { TODO_SORT_LABEL, TODO_SORT_ICON, type TodoPriorityFilter, type TodoSortKey } from './todoSort';
import { TODO_QUICK_FILTER_PREDICATES } from './todoQuickFilters';
import { CreateTodoModal } from './CreateTodoModal';
import { useTodosQuery } from './hook';
import { readQuickFilterParam } from '../../lib/readQuickFilterParam';
import type { Todo, TodoPriority } from '../../api/todos';

const QUICK_FILTER_VALUES = ['pending', 'completed', 'due', 'delayed'] as const;
const PRIORITIES: TodoPriority[] = ['high', 'medium', 'low'];
const SORT_KEYS = Object.keys(TODO_SORT_LABEL) as TodoSortKey[];

// A to-do card shows one coloured chip on a phone, its priority, so that is all the legend lists.
// Built from the same map the chip reads.
const TODO_LEGEND: ChipLegendSection[] = [
  { title: 'Priority', items: PRIORITIES.map((p) => ({ label: PRIORITY_MAP[p].label, icon: PRIORITY_MAP[p].icon, tone: PRIORITY_MAP[p].solid })) },
];

export const TodoPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  // Seeded from `?quickFilter=` (the Dashboard's rows deep-link in with it).
  const [quickFilter, setQuickFilter] = useState<TodoQuickFilterKey | null>(
    () => readQuickFilterParam(searchParams, QUICK_FILTER_VALUES),
  );
  const [priority, setPriority] = useState<TodoPriorityFilter>('all');
  // Newest first by default: the order the server already returns.
  const [sort, setSort] = useState<TodoSortKey>('created');
  // Same query key as TodoList, so this is served from cache.
  const { data: allTodos = [], isPending } = useTodosQuery();
  // Opened from a chart bar: only to-dos created inside that bar's period (see lib/createdRange).
  const createdRange = useCreatedRange();
  // The due-date filter from the calendar icon: only to-dos due inside it. A to-do with no due date is not in any range.
  const dueRange = useDueRange();
  const rangeFilter = useMemo(
    () => (t: Todo) => (createdRange.range ? createdRange.matches(t.createdAt) : true) && (dueRange.range ? !!t.dueDate && dueRange.matches(t.dueDate) : true),
    [createdRange, dueRange],
  );
  const todos = useMemo(() => allTodos.filter(rangeFilter), [allTodos, rangeFilter]);

  // `/todo?create=1` (the sidebar's "+") opens the form once, then drops the param.
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

  const toggleQuickFilter = (key: TodoQuickFilterKey) => setQuickFilter((prev) => (prev === key ? null : key));

  const quickCounts = {
    pending: todos.filter(TODO_QUICK_FILTER_PREDICATES.pending).length,
    completed: todos.filter(TODO_QUICK_FILTER_PREDICATES.completed).length,
    due: todos.filter(TODO_QUICK_FILTER_PREDICATES.due).length,
    delayed: todos.filter(TODO_QUICK_FILTER_PREDICATES.delayed).length,
  };

  // Mirrors TodoList's own narrowing so the sheet's count matches what's rendered.
  const quickFiltered = quickFilter ? todos.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : todos;
  const shownCount = priority === 'all' ? quickFiltered.length : quickFiltered.filter((t) => t.priority === priority).length;

  const clearFilters = () => {
    setPriority('all');
    setQuickFilter(null);
  };

  return (
    <div className="flex flex-col gap-3 pt-2.5 mx-auto w-full max-w-(--container-width) transition-all duration-300">
      {/* No visible title block, same as Delegation and Tickets: the nav item already says To-Do. */}
      <h1 className="sr-only">To-Do</h1>
      <CreatedRangeBanner range={createdRange.range} onClear={createdRange.clear} noun="to-dos" />

      <Fab actions={[{ key: 'add', label: 'Add todo', icon: Plus, onClick: () => setShowForm(true) }]} />

      <div className="flex flex-col gap-4">
        <TodoQuickStats
          counts={quickCounts}
          total={todos.length}
          active={quickFilter}
          onToggle={toggleQuickFilter}
          onClear={() => setQuickFilter(null)}
          isLoading={isPending}
        />

        {/* One controls row, same as the other list pages: Options on the left, the add button on
            the right on desktop (phones use the + button instead). */}
        {/* Right-aligned and in reverse order, so Options sits at the far right with Created on and the add button to its left. */}
        <div className="flex flex-row-reverse items-center gap-3">
          <OptionsSheet
            isOpen={showOptions}
            setIsOpen={setShowOptions}
            activeCount={priority === 'all' ? 0 : 1}
            subtitle={`${shownCount} of ${todos.length} to-dos`}
            onReset={() => { setPriority('all'); setSort('created'); }}
            canReset={priority !== 'all' || sort !== 'created'}
            showLabel={`Show ${shownCount} ${shownCount === 1 ? 'to-do' : 'to-dos'}`}
          >
            <OptionSection icon={Flag} label="Priority" aside={priority !== 'all' && <ChoiceClear onClick={() => setPriority('all')} />}>
              <ChoiceWrap>
                {PRIORITIES.map((p) => (
                  <ChoiceChip
                    key={p}
                    active={priority === p}
                    onClick={() => setPriority(priority === p ? 'all' : p)}
                    lead={<ChoiceIcon icon={PRIORITY_MAP[p].icon} tone={PRIORITY_MAP[p].solid} />}
                  >
                    {PRIORITY_MAP[p].label}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>

            <OptionSection icon={ArrowUpDown} label="Sort by">
              <OptionSegmented
                options={SORT_KEYS.map((k) => ({ value: k, label: TODO_SORT_LABEL[k], icon: TODO_SORT_ICON[k] }))}
                value={sort}
                onChange={setSort}
              />
            </OptionSection>
          </OptionsSheet>
          {/* Row is reversed, so this lands just left of Options. */}
          <ChipLegend sections={TODO_LEGEND} />

          <CreatedRangePicker createdRange={dueRange} label="Due date" className="shrink-0" />

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="hidden md:inline-flex group items-center h-9 rounded-full bg-primary-800 hover:bg-primary-900 dark:bg-primary-600 dark:hover:bg-primary-500 text-white text-sm font-display font-semibold tracking-tight ring-1 ring-inset ring-white/10 transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] data-[state=open]:bg-primary-900 dark:data-[state=open]:bg-primary-500"
          >
            <span className="flex items-center gap-2 pl-3.5 pr-4">
              <span className="flex items-center justify-center size-5 rounded-full bg-white/15">
                <Plus size={13} strokeWidth={3} className="transition-transform duration-300 group-hover:rotate-90" />
              </span>
              New To-do
            </span>
          </button>
        </div>
      </div>

      {dueRange.range && (
        <div className="flex flex-wrap items-center gap-2">
          {dueRange.range && (
            <button
              type="button"
              onClick={dueRange.clear}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 py-1 pl-3 pr-2 text-xs font-display font-semibold text-primary-700 transition-colors hover:bg-primary-500/15 dark:text-primary-300"
              aria-label={`Clear the due date filter: ${dueRange.range.label}`}
            >
              Due {dueRange.range.label}
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <TodoList quickFilter={quickFilter} priority={priority} sort={sort} onClearFilters={clearFilters} rangeFilter={rangeFilter} />

      <CreateTodoModal open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
};
