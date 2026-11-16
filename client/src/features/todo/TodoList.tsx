import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CheckCheck, Trash2, ListTodo, FilterX, ChevronDown } from 'lucide-react';
import { Skeleton, EmptyState, InlineError } from '../../components';
import { cn } from '@/lib/utils';
import { useUpdateTodoMutation, useDeleteTodoMutation, useClearCompletedMutation } from './hook';
import { useConfirm } from '../../components/confirmDialog/ConfirmDialog';
import { groupTodosByDue } from './todoGroups';
import { EditTodoModal } from './EditTodoModal';
import { TODO_VIEW_BODY, TODO_VIEW_GROUPED, TODO_VIEW_SPLIT, type TodoViewKey } from './todoViews';
import type { TodoActions } from './todoActions';
import type { TodoQuickFilterKey } from './TodoQuickStats';
import type { TodoSortKey } from './todoSort';
import type { Todo } from '../../api/todos';

interface TodoListProps {
  todos: readonly Todo[];
  view: TodoViewKey;
  sort: TodoSortKey;
  quickFilter: TodoQuickFilterKey | null;
  filtered: boolean;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
}

const UNDO_MS = 6000;
const CLEAR_BATCH_MAX = 500;
const COMPLETED_PREVIEW = 5;

export const TodoList = ({ todos, view, sort, quickFilter, filtered, isPending, isError, onRetry, onClearFilters }: TodoListProps) => {
  const updateMut = useUpdateTodoMutation();
  const deleteMut = useDeleteTodoMutation();
  const clearMut = useClearCompletedMutation();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [completedOpen, setCompletedOpen] = useState<boolean | null>(null);

  const actions = useMemo<TodoActions>(() => {
    const complete = (todo: Todo) => {
      const next = !todo.completed;
      updateMut.mutate({ id: todo.id, payload: { completed: next } });
      toast(next ? `Done: "${todo.text}"` : `Back on your list: "${todo.text}"`, {
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => updateMut.mutate({ id: todo.id, payload: { completed: todo.completed } }) },
      });
    };
    return {
      onToggle: (todo) => updateMut.mutate({ id: todo.id, payload: { completed: !todo.completed } }),
      onComplete: complete,
      onEdit: setEditing,
      onDelete: (todo) => deleteMut.mutate(todo.id),
      onSetDue: (todo, date) => updateMut.mutate({ id: todo.id, payload: { dueDate: date ? date.toISOString() : null } }),
    };
  }, [updateMut, deleteMut]);

  const { pending, completed } = useMemo(() => ({
    pending: todos.filter((t) => !t.completed),
    completed: todos.filter((t) => t.completed),
  }), [todos]);

  const clearCompleted = async (list: readonly Todo[]) => {
    const batch = list.slice(0, CLEAR_BATCH_MAX);
    const ok = await confirm({
      title: batch.length === 1 ? "Clear this completed to-do?" : `Clear ${batch.length} completed to-dos?`,
      description: "They leave your list. You can undo right after.",
      confirmLabel: "Clear",
      variant: "danger",
    });
    if (ok) clearMut.mutate(batch.map((t) => t.id));
  };

  if (isPending) return <TodoListSkeleton />;
  if (isError) return <InlineError message="Couldn't load your to-dos. Check your connection and try again." onRetry={onRetry} />;
  if (todos.length === 0) {
    if (filtered) {
      return (
        <EmptyState
          icon={FilterX}
          title="Nothing matches"
          description="No to-dos fit these filters. Clear them to see everything."
          action={{ label: 'Clear filters', onClick: onClearFilters }}
        />
      );
    }
    return (
      <EmptyState
        icon={ListTodo}
        title="Your list is empty"
        description={
          <>
            <span className="sm:hidden">Tap the + button to add a to-do. Tick it off here when it is done.</span>
            <span className="hidden sm:inline">Type a to-do in the box above and press Enter. Tick it off here when it is done.</span>
          </>
        }
      />
    );
  }

  const Body = TODO_VIEW_BODY[view];
  const grouped = sort === 'due' && TODO_VIEW_GROUPED[view];
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

  const split = showPending && showCompleted && TODO_VIEW_SPLIT[view];

  return (
    <div className={cn('flex flex-col gap-6', split && 'xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] xl:items-start')}>
      {showPending && (
        <TodoSection label="Pending" dotClassName="bg-vivid-blue" count={pending.length}>
          {caughtUp ? (
            <CaughtUp />
          ) : grouped ? (
            groupTodosByDue(pending).map((group) => (
              <div key={group.key} role="group" aria-label={group.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-0.5 pt-1">
                  <h4 className={cn('t-meta font-display font-semibold', group.key === 'overdue' ? 'text-vivid-red-text' : 'text-text-secondary')}>{group.label}</h4>
                  <span className="t-meta font-semibold text-text-muted tabular-nums">{group.todos.length}</span>
                  <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
                </div>
                <Body todos={group.todos} actions={actions} />
              </div>
            ))
          ) : (
            <Body todos={pending} actions={actions} />
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
            <CappedRows todos={completed} max={COMPLETED_PREVIEW} Body={Body} actions={actions} />
          )}
        </TodoSection>
      )}

      {editing && <EditTodoModal todo={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

const CaughtUp = () => (
  <div role="status" className="flex items-center gap-3 rounded-xl border border-vivid-green/40 bg-vivid-green/10 px-4 py-4">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-vivid-green text-on-vivid" aria-hidden="true">
      <CheckCheck className="size-5" strokeWidth={2.5} />
    </span>
    <div className="min-w-0">
      <p className="t-card font-display font-bold text-text">You're all caught up</p>
      <p className="t-meta font-medium text-text-secondary"><span className="sm:hidden">Tap the + button to add the next one.</span><span className="hidden sm:inline">Type in the box above and press Enter to add the next one.</span></p>
    </div>
  </div>
);

interface CappedRowsProps {
  todos: readonly Todo[];
  max: number;
  Body: (typeof TODO_VIEW_BODY)[TodoViewKey];
  actions: TodoActions;
}

const CappedRows = ({ todos, max, Body, actions }: CappedRowsProps) => {
  const [expanded, setExpanded] = useState(false);
  const capped = !expanded && todos.length > max;
  const visible = capped ? todos.slice(0, max) : todos;
  return (
    <>
      <Body todos={visible} actions={actions} />
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
