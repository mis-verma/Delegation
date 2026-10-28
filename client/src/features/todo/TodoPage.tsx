import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Flag, ArrowUpDown, Plus, Search, SquarePen, X } from 'lucide-react';
import { Button, Fab } from '../../components';
import { CreatedRangeBanner, CreatedRangePicker } from '../../components/createdRangeBanner';
import { useCreatedRange, useDueRange } from '../../lib/createdRange';
import {
  OptionsSheet, OptionSection, OptionSegmented, ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear,
} from '../../components/optionsSheet';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { TodoList } from './TodoList';
import { TodoQuickStats, type TodoQuickFilterKey } from './TodoQuickStats';
import { TodoViewTabs } from './TodoViewTabs';
import { TODO_SORT_LABEL, TODO_SORT_ICON, type TodoPriorityFilter, type TodoSortKey } from './todoSort';
import { TODO_QUICK_FILTER_PREDICATES } from './todoQuickFilters';
import { CreateTodoModal } from './CreateTodoModal';
import { TodoQuickAdd } from './TodoQuickAdd';
import { useTodosQuery } from './hook';
import { readQuickFilterParam } from '../../lib/readQuickFilterParam';
import { SEARCH_INPUT_CLASS } from '../scores/controlStyles';
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
  const [search, setSearch] = useState('');
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

  const needle = search.trim().toLowerCase();
  const quickFiltered = quickFilter ? todos.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : todos;
  const prioritized = priority === 'all' ? quickFiltered : quickFiltered.filter((t) => t.priority === priority);
  const shownCount = needle ? prioritized.filter((t) => t.text.toLowerCase().includes(needle)).length : prioritized.length;

  const clearFilters = () => {
    setPriority('all');
    setQuickFilter(null);
    setSearch('');
  };

  return (
    <div className="flex flex-col gap-4 pt-2.5 mx-auto w-full max-w-(--container-width) transition-all duration-300">
      <h1 className="sr-only">To-Do</h1>
      <CreatedRangeBanner range={createdRange.range} onClear={createdRange.clear} noun="to-dos" />

      <Fab actions={[{ key: 'add', label: 'Add to-do', icon: Plus, onClick: () => setShowForm(true) }]} />

      <TodoQuickStats
        counts={quickCounts}
        total={todos.length}
        active={quickFilter}
        onToggle={toggleQuickFilter}
        onClear={() => setQuickFilter(null)}
        isLoading={isPending}
      />

      <div className="flex items-start gap-2 max-sm:hidden">
        <div className="min-w-0 flex-1">
          <TodoQuickAdd />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowForm(true)}
          className="h-12 shrink-0 gap-1.5 rounded-xl px-4 font-display max-md:hidden"
          aria-label="Add a to-do with details"
        >
          <SquarePen size={16} aria-hidden="true" />
          With details
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="max-sm:hidden">
          <TodoViewTabs
            counts={{ all: todos.length, pending: quickCounts.pending, completed: quickCounts.completed }}
            filter={quickFilter}
            onSelect={setQuickFilter}
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <label className="relative block min-w-0 flex-1 max-sm:hidden sm:max-w-64 sm:flex-none sm:basis-64">
            <span className="sr-only">Search your to-dos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search to-dos"
              className={SEARCH_INPUT_CLASS}
            />
          </label>

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

          <CreatedRangePicker createdRange={dueRange} label="Due date" className="hidden sm:inline-flex shrink-0" />
        </div>
      </div>

      {dueRange.range && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={dueRange.clear}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 py-1 pl-3 pr-2 t-meta font-display font-semibold text-primary-700 transition-colors hover:bg-primary-500/15 dark:text-primary-300"
            aria-label={`Clear the due date filter: ${dueRange.range.label}`}
          >
            Due {dueRange.range.label}
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      <TodoList quickFilter={quickFilter} priority={priority} sort={sort} search={search} onClearFilters={clearFilters} rangeFilter={rangeFilter} />

      <CreateTodoModal open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
};
