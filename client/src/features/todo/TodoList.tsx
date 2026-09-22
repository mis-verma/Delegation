import { useState, type ReactNode } from 'react';
import { Trash2, Check, Pencil, ListTodo, CalendarClock, FilterX, ChevronDown } from 'lucide-react';
import { Skeleton } from '../../components';
import { ErrorMessage, EmptyState } from '../admin/adminDisplay';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useTodosQuery, useUpdateTodoMutation, useDeleteTodoMutation } from './hook';
import { relativeDayLabel } from './todoDate';
import { TODO_QUICK_FILTER_PREDICATES } from './todoQuickFilters';
import { sortTodos, type TodoPriorityFilter, type TodoSortKey } from './todoSort';
import { EditTodoModal } from './EditTodoModal';
import type { TodoQuickFilterKey } from './TodoQuickStats';
import type { Todo } from '../../api/todos';

interface TodoListProps {
  quickFilter?: TodoQuickFilterKey | null;
  priority?: TodoPriorityFilter;
  /** Omit to keep the server's own order — the drawer renders this list with no props. */
  sort?: TodoSortKey;
}

export const TodoList = ({
  quickFilter = null,
  priority = 'all',
  sort,
}: TodoListProps) => {
  const { data: allTodos = [], isPending, isError } = useTodosQuery();
  const updateMut = useUpdateTodoMutation();
  const deleteMut = useDeleteTodoMutation();
  const [editing, setEditing] = useState<Todo | null>(null);

  const quickFiltered = quickFilter ? allTodos.filter(TODO_QUICK_FILTER_PREDICATES[quickFilter]) : allTodos;
  const priorityFiltered = priority === 'all' ? quickFiltered : quickFiltered.filter((t) => t.priority === priority);
  const todos = sort ? sortTodos(priorityFiltered, sort) : priorityFiltered;

  const toggleComplete = (id: string, completed: boolean) => {
    updateMut.mutate({ id, payload: { completed: !completed } });
  };

  // Both mutations patch the cache in `onMutate`, so by the time a row would show an "in flight"
  // state it has already flipped (toggle) or left the list (delete). The old spinner/dimming
  // branches could no longer render, and a spinner drawn over an already-correct checkmark would
  // have undone the point of going optimistic, so they're gone.
  const renderRow = (todo: Todo, index: number) => {
    const priorityMeta = PRIORITY_MAP[todo.priority];

    return (
      <div
        key={todo.id}
        className={`group relative flex items-center gap-3 sm:gap-3.5 rounded-lg border p-3 sm:p-4 transition-all duration-200 ease-in-out animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none ${
          todo.completed
            ? 'border-border/50 bg-surface-hover/30 opacity-70 hover:opacity-100'
            : 'border-border bg-surface hover:border-border-hover'
        }`}
        // Stagger caps at 8 steps. Uncapped, a 40-item column made its last row wait 1.6s before
        // appearing, which reads as the list being broken rather than as a flourish.
        style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
        <button
          type="button"
          onClick={() => toggleComplete(todo.id, todo.completed)}
          aria-pressed={todo.completed}
          aria-label={todo.completed ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
          className={`shrink-0 flex items-center justify-center size-11 rounded-lg transition-all duration-200 ease-in-out cursor-pointer active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            todo.completed
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : `${priorityMeta.className} hover:ring-2 hover:ring-inset hover:ring-primary-400/40`
          }`}
        >
          <Check
            key={todo.completed ? 'done' : 'undone'}
            size={18}
            strokeWidth={2.5}
            className={`animate-in zoom-in-50 duration-300 motion-reduce:animate-none ${todo.completed ? '' : 'opacity-30'}`}
          />
        </button>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {/* line-clamp-2, not truncate: the field accepts 200 characters but a single truncated
              line showed roughly 40 of them with no way to read the rest. Two lines cover almost
              every real todo, and `title` gives the full text on hover for the ones they don't. */}
          <p
            title={todo.text}
            className={`text-sm sm:text-[15px] font-display font-medium leading-snug line-clamp-2 break-words transition-colors duration-200 ${
              todo.completed ? 'text-text-light line-through' : 'text-text'
            }`}
          >
            {todo.text}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Muted pastel chip — reuses the same soft-tinted token classes as the checkbox above
                (bg-{status}/10 + text-{status}) instead of a separate outline style, so priority
                reads as one consistent color language across the row. The inset ring gives "Low"
                (which tints to bg-surface-hover) an edge, so it still reads as a chip and not as
                stray text on the row background. */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full ring-1 ring-inset ring-current/15 transition-colors duration-200 ${priorityMeta.className}`}>
              {priorityMeta.label}
            </span>
            {todo.dueDate ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-display font-medium text-text-muted tabular-nums">
                <CalendarClock size={11} className="shrink-0" />
                {relativeDayLabel(new Date(todo.dueDate))}
              </span>
            ) : (
              <span className="text-[11px] font-display font-medium text-text-light">No due date</span>
            )}
          </div>
        </div>

        {/* Quick actions — always visible at a full 44px on touch, fading in as a hover reveal only
            where a real pointer exists so the resting row stays clean. Gating this on `sm:` (as it
            was) keyed off viewport width, so on any touch tablet ≥640px the actions were hidden
            with no hover to bring them back; `pointer-fine:` asks about the input device instead.
            `motion-reduce` drops the slide so the reveal is a plain fade. */}
        <div className="flex items-center gap-0.5 shrink-0 pointer-fine:opacity-0 pointer-fine:-translate-x-1 pointer-fine:group-hover:opacity-100 pointer-fine:group-hover:translate-x-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-focus-within:translate-x-0 motion-reduce:translate-x-0 transition-all duration-200 ease-in-out">
          <button
            type="button"
            onClick={() => setEditing(todo)}
            aria-label={`Edit "${todo.text}"`}
            className="flex items-center justify-center size-11 pointer-fine:size-9 rounded-lg text-text-light hover:text-primary-600 hover:bg-primary-500/10 transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => deleteMut.mutate(todo.id)}
            aria-label={`Delete "${todo.text}"`}
            className="flex items-center justify-center size-11 pointer-fine:size-9 rounded-lg text-text-light hover:text-danger hover:bg-danger/10 transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  };

  if (isPending) return <TodoListSkeleton />;
  if (isError) return <ErrorMessage message="Failed to load your to-dos." />;
  if (todos.length === 0) {
    // Priority now narrows the list too, so the "nothing matched" copy has to name whichever
    // filter is actually responsible rather than always blaming the stat tiles.
    if (quickFilter || priority !== 'all') {
      return (
        <EmptyState
          label="No matches for these filters"
          description={
            quickFilter && priority !== 'all'
              ? `Nothing here is both ${priority} priority and in the selected tile — try clearing one of them.`
              : quickFilter
                ? 'Nothing here matches the selected tile — try another one, or clear it above.'
                : `Nothing here is set to ${priority} priority — try another priority, or choose All.`
          }
          Icon={FilterX}
        />
      );
    }
    return (
      <EmptyState
        label="Nothing on your list yet"
        description="Add a to-do task for yourself and check it off once it's done."
        Icon={ListTodo}
      />
    );
  }

  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    // @container: this renders both full-width on the Todo page and inside the ~340px-wide Todo
    // drawer sidebar — a viewport breakpoint would force the side-by-side board layout in the
    // narrow drawer too (causing horizontal overflow), so the columns switch on the actual
    // rendered width instead.
    <div className="@container flex flex-col gap-5">
      <div className="flex flex-col @lg:flex-row gap-4 items-start">
        <TodoColumn label="Pending" dotClassName="bg-status-todo" todos={pending} emptyMessage="Nothing pending" renderRow={renderRow} />
        {/* Completed is capped: it only ever grows, so on a list a few weeks old it otherwise
            becomes a wall of struck-through rows sitting level with the work that still matters.
            Pending stays uncapped — nothing there is safe to hide behind a toggle. */}
        <TodoColumn label="Completed" dotClassName="bg-success" todos={completed} emptyMessage="Nothing completed yet" renderRow={renderRow} maxVisible={5} />
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

// Same board-column shape as TicketBoard's columns (dot + label + count pill header, vertical
// card stack below) so Pending/Completed reads as one consistent "board view" pattern app-wide.
const TodoColumn = ({ label, dotClassName, todos, emptyMessage, renderRow, maxVisible }: TodoColumnProps) => {
  const [expanded, setExpanded] = useState(false);
  const isCapped = maxVisible !== undefined && !expanded && todos.length > maxVisible;
  const visible = isCapped ? todos.slice(0, maxVisible) : todos;
  const hiddenCount = todos.length - visible.length;

  return (
    <section aria-label={label} className={COLUMN_SHELL_CLASS}>
      <header className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`size-2 rounded-full shrink-0 ${dotClassName}`} aria-hidden="true" />
          <h3 className="text-[13px] font-display font-bold text-text truncate">{label}</h3>
        </div>
        <span className="flex items-center justify-center min-w-7 h-6 px-2 text-[11px] font-bold text-text-secondary rounded-full bg-surface border border-border/60 tabular-nums">
          {todos.length}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        {todos.length === 0 ? (
          // py- rather than a fixed height, so the placeholder can't clip its own text at small
          // font scales or in the narrow drawer.
          <div className="flex items-center justify-center px-4 py-10 text-center border border-dashed border-border rounded-lg bg-surface/40">
            <span className="text-[11px] font-display font-medium text-text-muted">{emptyMessage}</span>
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
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[11px] font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          <ChevronDown size={13} className={`transition-transform duration-200 ease-in-out ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
};

// Shared by the real column and its skeleton so the loading state occupies the same box as the
// content that replaces it — the skeleton previously had no header and a different radius, so the
// whole board visibly re-laid itself the moment the query resolved.
const COLUMN_SHELL_CLASS =
  'flex-1 w-full min-w-0 flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-hover/30 p-3';

const TodoRowSkeleton = () => (
  <div className="flex items-center gap-3 sm:gap-3.5 p-3 sm:p-4 rounded-lg border border-border bg-surface">
    <Skeleton className="size-11 rounded-lg shrink-0" />
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
    <Skeleton className="size-9 rounded-lg shrink-0" />
  </div>
);

const TodoListSkeleton = () => (
  <div className="@container flex flex-col gap-5">
    <div className="flex flex-col @lg:flex-row gap-4 items-start">
      {[3, 2].map((count, col) => (
        <div key={col} className={COLUMN_SHELL_CLASS}>
          <div className="flex items-center justify-between gap-2 px-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-7 rounded-full" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: count }).map((_, i) => <TodoRowSkeleton key={i} />)}
          </div>
        </div>
      ))}
    </div>
  </div>
);