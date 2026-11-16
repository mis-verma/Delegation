import { CalendarDays, Check, Clock3, Trash2 } from 'lucide-react';
import { SwipeRow } from '../../components/swipeRow/SwipeRow';
import { PriorityChip, StatusBadge } from '../../components';
import { activateOnKey } from '../../components/dataTable';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { addedLabel, dueLabel } from './todoDate';
import { TODO_STATUS_META, todoStatusOf, type TodoStatusKey } from './todoStatus';
import { TodoCheck, TodoRowActions } from './TodoParts';
import type { TodoActions, TodoBodyProps } from './todoActions';
import type { Todo } from '../../api/todos';

const ROW_BORDER: Record<TodoStatusKey, string> = {
  done: 'border-border/40 dark:border-white/[0.04] bg-surface/60 hover:border-border-hover',
  overdue: 'border-vivid-red/50 bg-surface hover:border-vivid-red',
  today: 'border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50',
  open: 'border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50',
};

interface TodoRowProps {
  todo: Todo;
  index: number;
  actions: TodoActions;
}

const TodoRow = ({ todo, index, actions }: TodoRowProps) => {
  const status = todoStatusOf(todo);
  const meta = TODO_STATUS_META[status];

  return (
    <SwipeRow
      right={{ label: todo.completed ? 'Not done' : 'Done', icon: <Check size={16} aria-hidden />, tone: 'success', onTrigger: () => actions.onComplete(todo) }}
      left={{ label: 'Delete', icon: <Trash2 size={16} aria-hidden />, tone: 'danger', onTrigger: () => actions.onDelete(todo) }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => actions.onEdit(todo)}
        onKeyDown={activateOnKey(() => actions.onEdit(todo))}
        aria-label={`Edit "${todo.text}"`}
        className={cn(
          'group flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 active:bg-surface-hover/50 [-webkit-tap-highlight-color:transparent] animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none',
          ROW_BORDER[status],
        )}
        style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
        <TodoCheck todo={todo} onToggle={actions.onToggle} className="-m-2.5" />

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
              <StatusBadge variant={meta.variant} icon={meta.icon} label={meta.label} />
            ) : (
              <PriorityChip meta={PRIORITY_MAP[todo.priority]} />
            )}
            {!todo.completed && todo.dueDate && (
              <StatusBadge
                variant={meta.variant}
                icon={CalendarDays}
                label={status === 'overdue' ? `Overdue, ${dueLabel(todo.dueDate)}` : dueLabel(todo.dueDate)}
                title={status === 'open' ? 'Due' : meta.label}
              />
            )}
            <span className={cn('items-center gap-1 t-meta font-medium text-text-muted', !todo.completed && todo.dueDate ? 'hidden sm:inline-flex' : 'inline-flex')} title={new Date(todo.createdAt).toLocaleString()}>
              <Clock3 size={12} aria-hidden="true" />
              {addedLabel(todo.createdAt)}
            </span>
          </div>
        </div>

        <TodoRowActions todo={todo} actions={actions} className="-my-1 -mr-1.5" />
      </div>
    </SwipeRow>
  );
};

export const TodoListBody = ({ todos, actions }: TodoBodyProps) => (
  <div className="flex flex-col gap-2">
    {todos.map((todo, i) => <TodoRow key={todo.id} todo={todo} index={i} actions={actions} />)}
  </div>
);
