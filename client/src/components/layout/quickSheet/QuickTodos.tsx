import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useTodosQuery, useUpdateTodoMutation } from '../../../features/todo/hook';
import { TodoQuickAdd } from '../../../features/todo/TodoQuickAdd';
import { DASHBOARD_QUERY_OPTIONS } from '../../../lib/dashboardQuery';
import { DueChip } from '../../dueChip';
import { QuickList, QuickRow } from './QuickRow';
import { QUICK_MAX, byDueThenNewest, type PanelProps } from './quickShared';

export const QuickTodos = ({ now, onClose }: PanelProps) => {
  const query = useTodosQuery(true, DASHBOARD_QUERY_OPTIONS);
  const update = useUpdateTodoMutation();
  const open = useMemo(
    () =>
      (query.data ?? [])
        .filter((t) => !t.completed)
        .map((t) => ({ todo: t, due: t.dueDate ? new Date(t.dueDate).getTime() : null, created: new Date(t.createdAt).getTime() }))
        .sort(byDueThenNewest),
    [query.data],
  );

  return (
    <div className="flex flex-col gap-3">
      <TodoQuickAdd />
      <QuickList
        pending={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        total={open.length}
        emptyTitle="Nothing left to do"
        emptyHint="Add something above when it comes up."
      >
        {open.slice(0, QUICK_MAX).map(({ todo, due }) => (
          <QuickRow
            key={todo.id}
            title={todo.text}
            to="/todo"
            onOpen={onClose}
            hot={due !== null && due < now}
            lead={
              <button
                type="button"
                aria-label={`Mark done: ${todo.text}`}
                onClick={() => update.mutate({ id: todo.id, payload: { completed: true } })}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-90 motion-reduce:active:scale-100"
              >
                <span className="flex size-6 items-center justify-center rounded-full border-2 border-primary-500/50 text-transparent transition-colors duration-150 hover:border-primary-600 hover:text-primary-600">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
              </button>
            }
            meta={due !== null ? <DueChip at={due} now={now} /> : <span className="t-meta text-text-muted">No due date</span>}
          />
        ))}
      </QuickList>
    </div>
  );
};
