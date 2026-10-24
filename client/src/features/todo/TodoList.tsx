import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { SwipeRow } from '../../components/swipeRow/SwipeRow';
import { Check, Pencil, Trash2, MoreVertical, CalendarDays, ListTodo, FilterX, ChevronDown } from 'lucide-react';
import { Skeleton, EmptyState, IconChip, PriorityChip } from '../../components';
import { ErrorMessage } from '../admin/adminDisplay';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useTodosQuery, useUpdateTodoMutation, useDeleteTodoMutation, useClearCompletedMutation } from './hook';
import { useConfirm } from '../../components/confirmDialog/ConfirmDialog';
import { relativeDayLabel } from './todoDate';
import { TODO_QUICK_FILTER_PREDICATES, isOverdueTodo } from './todoQuickFilters';
import { sortTodos, type TodoPriorityFilter, type TodoSortKey } from './todoSort';
import { dueBucketOf, groupTodosByDue, type TodoGroup } from './todoGroups';
import { EditTodoModal } from './EditTodoModal';
import type { TodoQuickFilterKey } from './TodoQuickStats';
import type { Todo, TodoPriority } from '../../api/todos';

interface TodoListProps {
  quickFilter?: TodoQuickFilterKey | null;
  priority?: TodoPriorityFilter;
  rangeFilter?: (todo: Todo) => boolean;
  sort?: TodoSortKey;
  onClearFilters?: () => void;
}

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

const UNDO_MS = 6000;
const CLEAR_BATCH_MAX = 500;

export const TodoList = ({ quickFilter = null, priority = 'all', sort, onClearFilters, rangeFilter }: TodoListProps) => {
  const { data: allTodos = [], isPending, isError } = useTodosQuery();
  const updateMut = useUpdateTodoMutation();
  const deleteMut = useDeleteTodoMutation();
  const clearMut = useClearCompletedMutation();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Todo | null>(null);

  const inRange = rangeFilter ? allTodos.filter(rangeFilter) : allTodos;
  const quickFiltered = quickFilter ? inRange.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : inRange;
  const priorityFiltered = priority === 'all' ? quickFiltered : quickFiltered.filter((t) => t.priority === priority);
  const todos = sort ? sortTodos(priorityFiltered, sort) : priorityFiltered;

  const toggleComplete = (todo: Todo) => updateMut.mutate({ id: todo.id, payload: { completed: !todo.completed } });

  const completeWithUndo = (todo: Todo) => {
    const next = !todo.completed;
    updateMut.mutate({ id: todo.id, payload: { completed: next } });
    toast(next ? `Done: "${todo.text}"` : `Back on your list: "${todo.text}"`, {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => updateMut.mutate({ id: todo.id, payload: { completed: todo.completed } }) },
    });
  };

  const clearCompleted = async (list: Todo[]) => {
    const batch = list.slice(0, CLEAR_BATCH_MAX);
    const ok = await confirm({
      title: batch.length === 1 ? "Clear this completed to-do?" : `Clear ${batch.length} completed to-dos?`,
      description: "They leave your list. You can undo right after.",
      confirmLabel: "Clear",
      variant: "danger",
    });
    if (ok) clearMut.mutate(batch.map((t) => t.id));
  };

  const renderRow = (todo: Todo, index: number) => {
    const overdue = isOverdueTodo(todo);
    const dueToday = !overdue && !todo.completed && dueBucketOf(todo) === 'today';

    return (
      <SwipeRow
        key={todo.id}
        right={{ label: todo.completed ? 'Not done' : 'Done', icon: <Check size={16} aria-hidden />, tone: 'success', onTrigger: () => completeWithUndo(todo) }}
        left={{ label: 'Delete', icon: <Trash2 size={16} aria-hidden />, tone: 'danger', onTrigger: () => deleteMut.mutate(todo.id) }}
      >
      <div
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
            : overdue
              ? 'border-danger/40 bg-surface hover:border-danger/70'
              : 'border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50'
        }`}
        style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
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
            className={`t-card font-display font-semibold tracking-tight leading-snug line-clamp-2 break-words transition-colors duration-200 ${
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
                  tone={overdue ? 'bg-danger' : dueToday ? 'bg-warning' : 'bg-primary-700'}
                  label={overdue ? `Overdue, ${dueText(todo.dueDate)}` : dueText(todo.dueDate)}
                  title={overdue ? 'Overdue' : dueToday ? 'Due today' : 'Due'}
                  className={overdue ? 'border-danger/30 text-danger' : dueToday ? 'border-warning/40' : undefined}
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
      </SwipeRow>
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
        description="Type a to-do in the box above and press Enter. Tick it off here when it is done."
      />
    );
  }

  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    <div className="@container flex flex-col gap-5">
      <div className="flex flex-col @lg:flex-row gap-6 @lg:gap-5 items-start">
        <TodoColumn label="Pending" dotClassName="bg-primary-600" todos={pending} groups={sort === 'due' ? groupTodosByDue(pending) : undefined} emptyMessage="All done. Nothing left to do." renderRow={renderRow} />
        <TodoColumn label="Completed" dotClassName="bg-success" todos={completed} emptyMessage="Ticked-off to-dos show up here." renderRow={renderRow} maxVisible={5} action={completed.length > 0 ? (
          <button
            type="button"
            onClick={() => void clearCompleted(completed)}
            disabled={clearMut.isPending}
            className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-2.5 -my-2 rounded-lg t-meta font-display font-semibold text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            <Trash2 size={13} aria-hidden="true" />
            Clear completed
          </button>
        ) : undefined} />
      </div>

      {editing && <EditTodoModal todo={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

interface TodoColumnProps {
  label: string;
  dotClassName: string;
  todos: Todo[];
  groups?: TodoGroup[];
  emptyMessage: string;
  renderRow: (todo: Todo, index: number) => ReactNode;
  maxVisible?: number;
  action?: ReactNode;
}

const TodoColumn = ({ label, dotClassName, todos, groups, emptyMessage, renderRow, maxVisible, action }: TodoColumnProps) => {
  const [expanded, setExpanded] = useState(false);
  const isCapped = maxVisible !== undefined && !expanded && todos.length > maxVisible;
  const visible = isCapped ? todos.slice(0, maxVisible) : todos;
  const hiddenCount = todos.length - visible.length;

  return (
    <section aria-label={label} className="flex-1 w-full min-w-0 flex flex-col gap-2.5">
      <header className="flex items-center gap-2 px-0.5">
        <span className={`size-2 rounded-full shrink-0 ${dotClassName}`} aria-hidden="true" />
        <h3 className="t-card font-display font-semibold text-text tracking-tight">{label}</h3>
        <span className="t-meta font-semibold text-text-muted tabular-nums">{todos.length}</span>
        {action && <div className="ml-auto">{action}</div>}
      </header>

      <div className="flex flex-col gap-2">
        {todos.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-8 text-center border border-border/70 rounded-2xl">
            <span className="t-meta font-display font-medium text-text-muted">{emptyMessage}</span>
          </div>
        ) : groups ? (
          groups.map((group) => (
            <div key={group.key} role="group" aria-label={group.label} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-0.5 pt-1">
                <h4 className={`t-meta font-display font-semibold ${group.key === 'overdue' ? 'text-danger' : 'text-text-secondary'}`}>{group.label}</h4>
                <span className="t-meta font-semibold text-text-muted tabular-nums">{group.todos.length}</span>
                <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
              </div>
              {group.todos.map((todo, i) => renderRow(todo, i))}
            </div>
          ))
        ) : (
          visible.map((todo, i) => renderRow(todo, i))
        )}
      </div>

      {(isCapped || (expanded && maxVisible !== undefined && todos.length > maxVisible)) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center justify-center gap-1.5 w-full h-10 rounded-xl t-meta font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
