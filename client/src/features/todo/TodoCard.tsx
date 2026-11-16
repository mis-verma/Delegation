import { CalendarDays, Clock3 } from 'lucide-react';
import { ENTITY_CARD_CLASS, PriorityChip, StatusBadge } from '../../components';
import { activateOnKey } from '../../components/dataTable';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { addedLabel, dueLabel } from './todoDate';
import { TODO_STATUS_META, todoStatusOf } from './todoStatus';
import { TodoCheck, TodoRowActions } from './TodoParts';
import type { TodoActions, TodoBodyProps } from './todoActions';
import type { Todo } from '../../api/todos';

const TodoCard = ({ todo, actions }: { todo: Todo; actions: TodoActions }) => {
  const status = todoStatusOf(todo);
  const meta = TODO_STATUS_META[status];

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => actions.onEdit(todo)}
      onKeyDown={activateOnKey(() => actions.onEdit(todo))}
      aria-label={`Edit "${todo.text}"`}
      className={cn(
        ENTITY_CARD_CLASS,
        'cursor-pointer justify-start gap-3 p-4 sm:p-4 outline-none active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/30',
        todo.completed && 'bg-surface/60',
        status === 'overdue' && 'border-vivid-red/50 hover:border-vivid-red',
      )}
    >
      <div className="flex items-start gap-2">
        <TodoCheck todo={todo} onToggle={actions.onToggle} className="-m-2.5" />
        <p
          title={todo.text}
          className={cn(
            'min-w-0 flex-1 t-card font-display tracking-tight leading-snug line-clamp-3 break-words',
            todo.completed ? 'font-medium text-text-muted line-through decoration-text-muted/60' : 'font-semibold text-text',
          )}
        >
          {todo.text}
        </p>
        <TodoRowActions todo={todo} actions={actions} className="-my-1 -mr-1.5" />
      </div>

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
      </div>

      <span className="inline-flex items-center gap-1 t-meta font-medium text-text-muted" title={new Date(todo.createdAt).toLocaleString()}>
        <Clock3 size={12} aria-hidden="true" />
        {addedLabel(todo.createdAt)}
      </span>
    </article>
  );
};

export const TodoCardsBody = ({ todos, actions }: TodoBodyProps) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {todos.map((todo) => <TodoCard key={todo.id} todo={todo} actions={actions} />)}
  </div>
);
