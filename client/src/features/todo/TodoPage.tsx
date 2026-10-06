import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Flag, ArrowUpDown } from 'lucide-react';
import { Button, Fab } from '../../components';
import { CreatedRangeBanner, CreatedRangePicker } from '../../components/createdRangeBanner';
import { useCreatedRange } from '../../lib/createdRange';
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
import type { TodoPriority } from '../../api/todos';

const QUICK_FILTER_VALUES = ['pending', 'completed', 'due', 'delayed'] as const;
const PRIORITIES: TodoPriority[] = ['high', 'medium', 'low'];
const SORT_KEYS = Object.keys(TODO_SORT_LABEL) as TodoSortKey[];

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
  const todos = useMemo(
    () => (createdRange.range ? allTodos.filter((t) => createdRange.matches(t.createdAt)) : allTodos),
    [allTodos, createdRange],
  );

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
    <div className="flex flex-col gap-6 mx-auto w-full max-w-(--container-width) transition-all duration-300">
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
        <div className="flex items-center gap-3">
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

          <CreatedRangePicker createdRange={createdRange} className="w-44 shrink-0" />

          <Button size="sm" variant="primary" className="hidden md:inline-flex gap-1.5 ml-auto rounded-full font-display" onClick={() => setShowForm(true)}>
            <Plus size={15} strokeWidth={2.5} />
            New to-do
          </Button>
        </div>
      </div>

      <TodoList quickFilter={quickFilter} priority={priority} sort={sort} onClearFilters={clearFilters} />

      <CreateTodoModal open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
};
