import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { SwipeRow } from '../../components/swipeRow/SwipeRow';
import { Check, CheckCheck, CheckCircle2, CalendarClock, CalendarDays, Clock3, Pencil, RotateCcw, Trash2, MoreVertical, ListTodo, FilterX, ChevronDown } from 'lucide-react';
import { Skeleton, EmptyState, PriorityChip, StatusBadge } from '../../components';
import { ErrorMessage } from '../admin/adminDisplay';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useTodosQuery, useUpdateTodoMutation, useDeleteTodoMutation, useClearCompletedMutation } from './hook';
import { useConfirm } from '../../components/confirmDialog/ConfirmDialog';
import { addedLabel, dueLabel } from './todoDate';
import { TODO_QUICK_FILTER_PREDICATES, isOverdueTodo } from './todoQuickFilters';
import { sortTodos, type TodoPriorityFilter, type TodoSortKey } from './todoSort';
import { dueBucketOf, groupTodosByDue, type TodoGroup } from './todoGroups';
import { EditTodoModal } from './EditTodoModal';
import { TodoDueMenu } from './TodoMenus';
import type { TodoQuickFilterKey } from './TodoQuickStats';
import type { Todo, TodoPriority } from '../../api/todos';

interface TodoListProps {
  quickFilter?: TodoQuickFilterKey | null;
  priority?: TodoPriorityFilter;
  rangeFilter?: (todo: Todo) => boolean;
  search?: string;
  sort?: TodoSortKey;
  onClearFilters?: () => void;
}

const RING_CLASS: Record<TodoPriority, string> = {
  high: 'border-vivid-red',
  medium: 'border-vivid-sky',
  low: 'border-vivid-blue',
};

const UNDO_MS = 6000;
const CLEAR_BATCH_MAX = 500;
const COMPLETED_PREVIEW = 5;

const ACTION_CLASS = 'flex size-8 items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 cursor-pointer hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:size-11';

export const TodoList = ({ quickFilter = null, priority = 'all', sort, onClearFilters, rangeFilter, search = '' }: TodoListProps) => {
  const { data: allTodos = [], isPending, isError } = useTodosQuery();
  const updateMut = useUpdateTodoMutation();
  const deleteMut = useDeleteTodoMutation();
  const clearMut = useClearCompletedMutation();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [completedOpen, setCompletedOpen] = useState<boolean | null>(null);

  const needle = search.trim().toLowerCase();
  const inRange = rangeFilter ? allTodos.filter(rangeFilter) : allTodos;
  const quickFiltered = quickFilter ? inRange.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : inRange;
  const priorityFiltered = priority === 'all' ? quickFiltered : quickFiltered.filter((t) => t.priority === priority);
  const searched = needle ? priorityFiltered.filter((t) => t.text.toLowerCase().includes(needle)) : priorityFiltered;
  const todos = sort ? sortTodos(searched, sort) : searched;

  const toggleComplete = (todo: Todo) => updateMut.mutate({ id: todo.id, payload: { completed: !todo.completed } });

  const completeWithUndo = (todo: Todo) => {
    const next = !todo.completed;
    updateMut.mutate({ id: todo.id, payload: { completed: next } });
    toast(next ? `Done: "${todo.text}"` : `Back on your list: "${todo.text}"`, {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => updateMut.mutate({ id: todo.id, payload: { completed: todo.completed } }) },
    });
  };

  const setDue = (todo: Todo, date: Date | null) =>
    updateMut.mutate({ id: todo.id, payload: { dueDate: date ? date.toISOString() : null } });

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
    const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

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
        className={cn(
          'group flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 active:bg-surface-hover/50 [-webkit-tap-highlight-color:transparent] animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none',
          todo.completed
            ? 'border-border/40 dark:border-white/[0.04] bg-surface/60 hover:border-border-hover'
            : overdue
              ? 'border-vivid-red/50 bg-surface hover:border-vivid-red'
              : 'border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50',
        )}
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
            className={cn(
              'flex items-center justify-center size-6 rounded-full border-2 transition-all duration-200 ease-in-out active:scale-90',
              todo.completed ? 'bg-vivid-green border-vivid-green text-white' : `${RING_CLASS[todo.priority]} text-transparent hover:text-text-muted`,
            )}
          >
            <Check key={todo.completed ? 'done' : 'undone'} size={13} strokeWidth={3.25} className="animate-in zoom-in-50 duration-200 motion-reduce:animate-none" />
          </span>
        </button>

        <div className="flex-1 min-w-0 flex flex-col gap-2 pt-0.5">
          <p
            title={todo.text}
            className={cn(
              't-card font-display tracking-tight leading-snug line-clamp-2 break-words transition-colors duration-200',
              todo.completed ? 'font-medium text-text-muted line-through decoration-text-muted/60' : 'font-semibold text-text',
            )}
          >
            {todo.text}
          </p>

          <div className="flex items-center gap-1.5 flex-wrap">
            {todo.completed ? (
              <StatusBadge variant="success" icon={CheckCircle2} label="Done" />
            ) : (
              <PriorityChip meta={PRIORITY_MAP[todo.priority]} />
            )}
            {!todo.completed && todo.dueDate && (
              <StatusBadge
                variant={overdue ? 'critical' : dueToday ? 'warning' : 'neutral'}
                icon={CalendarDays}
                label={overdue ? `Overdue, ${dueLabel(todo.dueDate)}` : dueLabel(todo.dueDate)}
                title={overdue ? 'Overdue' : dueToday ? 'Due today' : 'Due'}
              />
            )}
            <span className="inline-flex items-center gap-1 t-meta font-medium text-text-muted" title={new Date(todo.createdAt).toLocaleString()}>
              <Clock3 size={12} aria-hidden="true" />
              {addedLabel(todo.createdAt)}
            </span>
          </div>
        </div>

        <div
          onClick={stop}
          className="hidden sm:flex shrink-0 items-center gap-0.5 -my-1 -mr-1.5 transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
        >
          <button
            type="button"
            onClick={() => completeWithUndo(todo)}
            aria-label={todo.completed ? `Reopen "${todo.text}"` : `Mark "${todo.text}" as done`}
            title={todo.completed ? 'Reopen' : 'Mark as done'}
            className={ACTION_CLASS}
          >
            {todo.completed ? <RotateCcw size={15} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => setEditing(todo)} aria-label={`Edit "${todo.text}"`} title="Edit" className={ACTION_CLASS}>
            <Pencil size={15} aria-hidden="true" />
          </button>
          <TodoDueMenu value={todo.dueDate ? new Date(todo.dueDate) : null} onChange={(date) => setDue(todo, date)}>
            <button type="button" aria-label={`Set a due date for "${todo.text}"`} title="Set due date" className={ACTION_CLASS}>
              <CalendarClock size={15} aria-hidden="true" />
            </button>
          </TodoDueMenu>
          <button
            type="button"
            onClick={() => deleteMut.mutate(todo.id)}
            aria-label={`Delete "${todo.text}"`}
            title="Delete"
            className={cn(ACTION_CLASS, 'hover:bg-danger/10 hover:text-danger')}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={stop}
              aria-label={`More actions for "${todo.text}"`}
              className="sm:hidden shrink-0 flex items-center justify-center size-9 -my-1 -mr-1.5 rounded-full text-text-muted hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
            >
              <MoreVertical size={17} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5" onClick={stop}>
            <DropdownMenuItem onClick={() => completeWithUndo(todo)} className="gap-2.5 py-2 cursor-pointer">
              {todo.completed ? <RotateCcw size={14} /> : <Check size={14} />}
              <span className="text-sm font-medium">{todo.completed ? 'Reopen' : 'Mark done'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditing(todo)} className="gap-2.5 py-2 cursor-pointer">
              <Pencil size={14} />
              <span className="text-sm font-medium">Edit or set due date</span>
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
    if (quickFilter || priority !== 'all' || needle) {
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
  const showPending = quickFilter !== 'completed';
  const showCompleted = quickFilter === 'completed' || (quickFilter === null && completed.length > 0);
  const collapsible = quickFilter === null;
  const completedExpanded = !collapsible || (completedOpen ?? pending.length === 0);
  const caughtUp = showPending && quickFilter !== 'due' && quickFilter !== 'delayed' && pending.length === 0;

  const clearAction = completed.length > 0 ? (
    <button
      type="button"
      onClick={() => void clearCompleted(completed)}
      disabled={clearMut.isPending}
      className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-2.5 -my-2 rounded-lg t-meta font-display font-semibold text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
    >
      <Trash2 size={13} aria-hidden="true" />
      Clear completed
    </button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {showPending && (
        <TodoSection label="Pending" dotClassName="bg-vivid-blue" count={pending.length}>
          {caughtUp ? (
            <CaughtUp />
          ) : sort === 'due' ? (
            <TodoGroups groups={groupTodosByDue(pending)} renderRow={renderRow} />
          ) : (
            pending.map((todo, i) => renderRow(todo, i))
          )}
        </TodoSection>
      )}

      {showCompleted && (
        <TodoSection
          label="Completed"
          dotClassName="bg-vivid-green"
          count={completed.length}
          open={completedExpanded}
          onToggle={collapsible ? () => setCompletedOpen(!completedExpanded) : undefined}
          action={completedExpanded ? clearAction : undefined}
        >
          {completed.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-8 text-center border border-border/70 rounded-xl">
              <span className="t-meta font-display font-medium text-text-muted">Ticked-off to-dos show up here.</span>
            </div>
          ) : (
            <CappedRows todos={completed} max={COMPLETED_PREVIEW} renderRow={renderRow} />
          )}
        </TodoSection>
      )}

      {editing && <EditTodoModal todo={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

const CaughtUp = () => (
  <div role="status" className="flex items-center gap-3 rounded-xl border border-vivid-green/40 bg-vivid-green/10 px-4 py-4">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-vivid-green to-vivid-green/70 text-on-vivid" aria-hidden="true">
      <CheckCheck className="size-5" strokeWidth={2.5} />
    </span>
    <div className="min-w-0">
      <p className="t-card font-display font-bold text-text">You're all caught up</p>
      <p className="t-meta font-medium text-text-secondary">Type in the box above and press Enter to add the next one.</p>
    </div>
  </div>
);

const TodoGroups = ({ groups, renderRow }: { groups: TodoGroup[]; renderRow: (todo: Todo, index: number) => ReactNode }) => (
  <>
    {groups.map((group) => (
      <div key={group.key} role="group" aria-label={group.label} className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-0.5 pt-1">
          <h4 className={cn('t-meta font-display font-semibold', group.key === 'overdue' ? 'text-vivid-red-text' : 'text-text-secondary')}>{group.label}</h4>
          <span className="t-meta font-semibold text-text-muted tabular-nums">{group.todos.length}</span>
          <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
        </div>
        {group.todos.map((todo, i) => renderRow(todo, i))}
      </div>
    ))}
  </>
);

const CappedRows = ({ todos, max, renderRow }: { todos: Todo[]; max: number; renderRow: (todo: Todo, index: number) => ReactNode }) => {
  const [expanded, setExpanded] = useState(false);
  const capped = !expanded && todos.length > max;
  const visible = capped ? todos.slice(0, max) : todos;
  return (
    <>
      {visible.map((todo, i) => renderRow(todo, i))}
      {todos.length > max && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center justify-center gap-1.5 w-full h-10 rounded-xl t-meta font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:h-11"
        >
          {expanded ? 'Show fewer' : `Show ${todos.length - visible.length} more`}
          <ChevronDown size={14} className={cn('transition-transform duration-200 ease-in-out', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </>
  );
};

interface TodoSectionProps {
  label: string;
  dotClassName: string;
  count: number;
  open?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  children: ReactNode;
}

const TodoSection = ({ label, dotClassName, count, open = true, onToggle, action, children }: TodoSectionProps) => {
  const title = (
    <>
      <span className={cn('size-2 rounded-full shrink-0', dotClassName)} aria-hidden="true" />
      <h3 className="t-card font-display font-semibold text-text tracking-tight">{label}</h3>
      <span className="t-meta font-semibold text-text-muted tabular-nums">{count}</span>
      {onToggle && <ChevronDown size={14} className={cn('text-text-muted transition-transform duration-200 ease-in-out', open && 'rotate-180')} aria-hidden="true" />}
    </>
  );
  return (
    <section aria-label={label} className="flex w-full min-w-0 flex-col gap-2.5">
      <header className="flex items-center gap-2 px-0.5">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${label.toLowerCase()} to-dos, ${count}`}
            className="flex min-h-9 items-center gap-2 rounded-lg pr-2 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
          >
            {title}
          </button>
        ) : (
          <div className="flex items-center gap-2">{title}</div>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
};

const TodoRowSkeleton = () => (
  <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border/60 bg-surface">
    <Skeleton className="size-6 rounded-full shrink-0" />
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-6 w-1/2 rounded-full" />
    </div>
  </div>
);

const TodoListSkeleton = () => (
  <div className="flex flex-col gap-6" role="status" aria-label="Loading your to-dos">
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      <Skeleton className="h-4 w-20" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => <TodoRowSkeleton key={i} />)}
      </div>
    </div>
  </div>
);
