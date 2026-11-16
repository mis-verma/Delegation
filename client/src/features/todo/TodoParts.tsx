import { Check, CalendarClock, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TodoDueMenu } from './TodoMenus';
import type { TodoActions } from './todoActions';
import type { Todo, TodoPriority } from '../../api/todos';

const RING_CLASS: Record<TodoPriority, string> = {
  high: 'border-vivid-red',
  medium: 'border-vivid-sky',
  low: 'border-vivid-blue',
};

const ACTION_CLASS = 'flex size-8 items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 cursor-pointer hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:size-11';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export const TodoCheck = ({ todo, onToggle, className }: { todo: Todo; onToggle: (todo: Todo) => void; className?: string }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onToggle(todo); }}
    aria-pressed={todo.completed}
    aria-label={todo.completed ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
    className={cn('shrink-0 flex items-center justify-center size-11 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]', className)}
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
);

interface TodoRowActionsProps {
  todo: Todo;
  actions: TodoActions;
  className?: string;
}

export const TodoRowActions = ({ todo, actions, className }: TodoRowActionsProps) => (
  <>
    <div
      onClick={stop}
      className={cn('hidden sm:flex shrink-0 items-center gap-0.5 transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100', className)}
    >
      <button
        type="button"
        onClick={() => actions.onComplete(todo)}
        aria-label={todo.completed ? `Reopen "${todo.text}"` : `Mark "${todo.text}" as done`}
        title={todo.completed ? 'Reopen' : 'Mark as done'}
        className={ACTION_CLASS}
      >
        {todo.completed ? <RotateCcw size={15} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
      </button>
      <button type="button" onClick={() => actions.onEdit(todo)} aria-label={`Edit "${todo.text}"`} title="Edit" className={ACTION_CLASS}>
        <Pencil size={15} aria-hidden="true" />
      </button>
      <TodoDueMenu value={todo.dueDate ? new Date(todo.dueDate) : null} onChange={(date) => actions.onSetDue(todo, date)}>
        <button type="button" aria-label={`Set a due date for "${todo.text}"`} title="Set due date" className={ACTION_CLASS}>
          <CalendarClock size={15} aria-hidden="true" />
        </button>
      </TodoDueMenu>
      <button
        type="button"
        onClick={() => actions.onDelete(todo)}
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
        <DropdownMenuItem onClick={() => actions.onComplete(todo)} className="gap-2.5 py-2 cursor-pointer">
          {todo.completed ? <RotateCcw size={14} /> : <Check size={14} />}
          <span className="text-sm font-medium">{todo.completed ? 'Reopen' : 'Mark done'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.onEdit(todo)} className="gap-2.5 py-2 cursor-pointer">
          <Pencil size={14} />
          <span className="text-sm font-medium">Edit or set due date</span>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(todo)} className="gap-2.5 py-2 cursor-pointer">
          <Trash2 size={14} />
          <span className="text-sm font-medium">Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </>
);
