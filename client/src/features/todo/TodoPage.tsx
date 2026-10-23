import { useEffect, useMemo, useState } from 'react';
import { CreateButton } from '../../components/createButton';
import { useSearchParams } from 'react-router';
import { Plus, Flag, ArrowUpDown, X } from 'lucide-react';
import { Fab } from '../../components';
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

export const TodoPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [quickFilter, setQuickFilter] = useState<TodoQuickFilterKey | null>(
    () => readQuickFilterParam(searchParams, QUICK_FILTER_VALUES),
  );
  const [priority, setPriority] = useState<TodoPriorityFilter>('all');
  const [sort, setSort] = useState<TodoSortKey>('created');
  const { data: allTodos = [], isPending } = useTodosQuery();
  const createdRange = useCreatedRange();
  const dueRange = useDueRange();
  const rangeFilter = useMemo(
    () => (t: Todo) => (createdRange.range ? createdRange.matches(t.createdAt) : true) && (dueRange.range ? !!t.dueDate && dueRange.matches(t.dueDate) : true),
    [createdRange, dueRange],
  );
  const todos = useMemo(() => allTodos.filter(rangeFilter), [allTodos, rangeFilter]);

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

  const quickFiltered = quickFilter ? todos.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : todos;
  const shownCount = priority === 'all' ? quickFiltered.length : quickFiltered.filter((t) => t.priority === priority).length;

  const clearFilters = () => {
    setPriority('all');
    setQuickFilter(null);
  };

  return (
    <div className="flex flex-col gap-3 pt-2.5 mx-auto w-full max-w-(--container-width) transition-all duration-300">
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

        <div className="hidden sm:flex flex-row-reverse items-center gap-3">
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

          <CreatedRangePicker createdRange={dueRange} label="Due date" className="shrink-0" />

          <CreateButton label="New to-do" onClick={() => setShowForm(true)} className="hidden md:inline-flex" />
        </div>
      </div>

      {dueRange.range && (
        <div className="flex flex-wrap items-center gap-2">
          {dueRange.range && (
            <button
              type="button"
              onClick={dueRange.clear}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 py-1 pl-3 pr-2 t-meta font-display font-semibold text-primary-700 transition-colors hover:bg-primary-500/15 dark:text-primary-300"
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
