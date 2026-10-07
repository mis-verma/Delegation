import { useState, type ReactNode } from 'react';
import { Check, Pencil, Trash2, MoreVertical, CalendarDays, ListTodo, FilterX, ChevronDown } from 'lucide-react';
import { Skeleton, EmptyState, IconChip, PriorityChip } from '../../components';
import { ErrorMessage } from '../admin/adminDisplay';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useTodosQuery, useUpdateTodoMutation, useDeleteTodoMutation } from './hook';
import { relativeDayLabel } from './todoDate';
import { TODO_QUICK_FILTER_PREDICATES, isOverdueTodo } from './todoQuickFilters';
import { sortTodos, type TodoPriorityFilter, type TodoSortKey } from './todoSort';
import { EditTodoModal } from './EditTodoModal';
import type { TodoQuickFilterKey } from './TodoQuickStats';
import type { Todo, TodoPriority } from '../../api/todos';

interface TodoListProps {
  quickFilter?: TodoQuickFilterKey | null;
  priority?: TodoPriorityFilter;
  /** An extra filter applied first, for example a created or due date range. */
  rangeFilter?: (todo: Todo) => boolean;
  /** Omit to keep the server's own order — the drawer renders this list with no props. */
  sort?: TodoSortKey;
  /** Offered on the "nothing matched" empty state when filters are the reason it's empty. */
  onClearFilters?: () => void;
}

// Unticked circle takes the priority's colour, so how urgent something is shows before you read
// the chip (the same idea as most to-do apps' priority rings).
const RING_CLASS: Record<TodoPriority, string> = {
  high: 'border-danger',
  medium: 'border-warning',
  low: 'border-text-light',
};

const dueText = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${relativeDayLabel(d)}, ${time}`;
};

export const TodoList = ({ quickFilter = null, priority = 'all', sort, onClearFilters, rangeFilter }: TodoListProps) => {
  const { data: allTodos = [], isPending, isError } = useTodosQuery();
  const updateMut = useUpdateTodoMutation();
  const deleteMut = useDeleteTodoMutation();
  const [editing, setEditing] = useState<Todo | null>(null);

  const inRange = rangeFilter ? allTodos.filter(rangeFilter) : allTodos;
  const quickFiltered = quickFilter ? inRange.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : inRange;
  const priorityFiltered = priority === 'all' ? quickFiltered : quickFiltered.filter((t) => t.priority === priority);
  const todos = sort ? sortTodos(priorityFiltered, sort) : priorityFiltered;

  // Both mutations patch the cache optimistically, so a row flips (toggle) or leaves (delete)
  // at once; no in-flight states needed.
  const toggleComplete = (todo: Todo) => updateMut.mutate({ id: todo.id, payload: { completed: !todo.completed } });

  const renderRow = (todo: Todo, index: number) => {
    const overdue = isOverdueTodo(todo);

    return (
      <div
        key={todo.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(todo)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(todo);
          }
        }}
        aria-label={`Edit "${todo.text}"`}
        className={`group flex items-start gap-3 p-3.5 rounded-2xl border transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 active:bg-surface-hover/50 [-webkit-tap-highlight-color:transparent] animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none ${
          todo.completed
            ? 'border-border/40 dark:border-white/[0.04] bg-surface/60'
            : 'border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50'
        }`}
        // Stagger caps at 8 steps so a long list doesn't make its last row wait.
        style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
        {/* 44px hit area around a 24px circle. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleComplete(todo); }}
          aria-pressed={todo.completed}
          aria-label={todo.completed ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
          className="shrink-0 flex items-center justify-center size-11 -m-2.5 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
        >
          <span
            className={`flex items-center justify-center size-6 rounded-full border-2 transition-all duration-200 ease-in-out active:scale-90 ${
              todo.completed
                ? 'bg-success border-success text-white'
                : `${RING_CLASS[todo.priority]} text-transparent hover:text-text-light/70`
            }`}
          >
            <Check key={todo.completed ? 'done' : 'undone'} size={13} strokeWidth={3.25} className="animate-in zoom-in-50 duration-200 motion-reduce:animate-none" />
          </span>
        </button>

        <div className="flex-1 min-w-0 flex flex-col gap-2 pt-0.5">
          <p
            title={todo.text}
            className={`text-[15px] font-display font-semibold tracking-tight leading-snug line-clamp-2 break-words transition-colors duration-200 ${
              todo.completed ? 'text-text-light line-through decoration-text-light/60' : 'text-text'
            }`}
          >
            {todo.text}
          </p>

          {!todo.completed && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <PriorityChip meta={PRIORITY_MAP[todo.priority]} />
              {todo.dueDate && (
                <IconChip
                  icon={CalendarDays}
                  tone={overdue ? 'bg-danger' : 'bg-primary-700'}
                  label={dueText(todo.dueDate)}
                  title={overdue ? 'Overdue' : 'Due'}
                  className={overdue ? 'border-danger/30 text-danger' : undefined}
                />
              )}
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`More actions for "${todo.text}"`}
              className="shrink-0 flex items-center justify-center size-9 -my-1 -mr-1.5 rounded-full text-text-light hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
            >
              <MoreVertical size={17} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 rounded-xl p-1.5" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => setEditing(todo)} className="gap-2.5 py-2 cursor-pointer">
              <Pencil size={14} />
              <span className="text-sm font-medium">Edit</span>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => deleteMut.mutate(todo.id)} className="gap-2.5 py-2 cursor-pointer">
              <Trash2 size={14} />
              <span className="text-sm font-medium">Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  if (isPending) return <TodoListSkeleton />;
  if (isError) return <ErrorMessage message="Couldn't load your to-dos. Check your connection and try again." />;
  if (todos.length === 0) {
    if (quickFilter || priority !== 'all') {
      return (
        <EmptyState
          icon={FilterX}
          title="Nothing matches"
          description="No to-dos fit these filters. Clear them to see everything."
          action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
        />
      );
    }
    return (
      <EmptyState
        icon={ListTodo}
        title="Your list is empty"
        description="Add something you need to get done, then tick it off here."
      />
    );
  }

  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    // @container: this renders full-width on the To-Do page and inside the ~340px To-Do drawer,
    // so the two-column layout switches on the list's own width, not the viewport.
    <div className="@container flex flex-col gap-5">
      <div className="flex flex-col @lg:flex-row gap-6 @lg:gap-5 items-start">
        <TodoColumn label="Pending" dotClassName="bg-primary-600" todos={pending} emptyMessage="All done. Nothing left to do." renderRow={renderRow} />
        {/* Completed is capped: it only ever grows. */}
        <TodoColumn label="Completed" dotClassName="bg-success" todos={completed} emptyMessage="Ticked-off to-dos show up here." renderRow={renderRow} maxVisible={5} />
      </div>

      {editing && <EditTodoModal todo={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

interface TodoColumnProps {
  label: string;
  dotClassName: string;
  todos: Todo[];
  emptyMessage: string;
  renderRow: (todo: Todo, index: number) => ReactNode;
  /** Show at most this many rows, with a "show the rest" toggle below. Omit for no cap. */
  maxVisible?: number;
}

const TodoColumn = ({ label, dotClassName, todos, emptyMessage, renderRow, maxVisible }: TodoColumnProps) => {
  const [expanded, setExpanded] = useState(false);
  const isCapped = maxVisible !== undefined && !expanded && todos.length > maxVisible;
  const visible = isCapped ? todos.slice(0, maxVisible) : todos;
  const hiddenCount = todos.length - visible.length;

  return (
    <section aria-label={label} className="flex-1 w-full min-w-0 flex flex-col gap-2.5">
      <header className="flex items-center gap-2 px-0.5">
        <span className={`size-2 rounded-full shrink-0 ${dotClassName}`} aria-hidden="true" />
        <h3 className="text-sm font-display font-semibold text-text tracking-tight">{label}</h3>
        <span className="text-xs font-semibold text-text-muted tabular-nums">{todos.length}</span>
      </header>

      <div className="flex flex-col gap-2">
        {todos.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-8 text-center border border-dashed border-border/70 rounded-2xl">
            <span className="text-xs font-display font-medium text-text-muted">{emptyMessage}</span>
          </div>
        ) : (
          visible.map((todo, i) => renderRow(todo, i))
        )}
      </div>

      {(isCapped || (expanded && maxVisible !== undefined && todos.length > maxVisible)) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center justify-center gap-1.5 w-full h-10 rounded-xl text-xs font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          <ChevronDown size={14} className={`transition-transform duration-200 ease-in-out ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
};

const TodoRowSkeleton = () => (
  <div className="flex items-start gap-3 p-3.5 rounded-2xl border border-border/60 bg-surface">
    <Skeleton className="size-6 rounded-full shrink-0" />
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-6 w-1/2 rounded-full" />
    </div>
  </div>
);

const TodoListSkeleton = () => (
  <div className="@container flex flex-col gap-5">
    <div className="flex flex-col @lg:flex-row gap-6 @lg:gap-5 items-start">
      {[3, 2].map((count, col) => (
        <div key={col} className="flex-1 w-full min-w-0 flex flex-col gap-2.5">
          <Skeleton className="h-4 w-20" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: count }).map((_, i) => <TodoRowSkeleton key={i} />)}
          </div>
        </div>
      ))}
    </div>
  </div>
);
