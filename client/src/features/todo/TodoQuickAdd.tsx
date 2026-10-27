import { useState, type FormEvent } from 'react';
import { Plus, CornerDownLeft, CalendarDays, X } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useCreateTodoMutation } from './hook';
import { TodoDueMenu, TodoPriorityMenu } from './TodoMenus';
import { dueLabel } from './todoDate';
import type { TodoPriority } from '../../api/todos';

const MAX_LENGTH = 200;

const CHIP_CLASS = 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-2.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 cursor-pointer hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:h-11';

export const TodoQuickAdd = () => {
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [touched, setTouched] = useState(false);
  const createMut = useCreateTodoMutation();
  const trimmed = text.trim();
  const PriorityIcon = PRIORITY_MAP[priority].icon;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || createMut.isPending) return;
    createMut.mutate(
      { text: trimmed, priority, dueDate: dueDate ? dueDate.toISOString() : undefined },
      { onSuccess: () => { setText(''); setDueDate(null); setPriority('medium'); setTouched(false); } },
    );
  };

  return (
    <form
      onSubmit={submit}
      onFocus={() => setTouched(true)}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      aria-label="Add a to-do"
    >
      <label
        htmlFor="todo-quick-add"
        className={cn(
          'flex flex-1 min-w-0 items-center gap-3 h-12 px-3.5 rounded-xl border bg-surface cursor-text transition-colors duration-150',
          'border-border/60 hover:border-border-hover focus-within:border-primary-400',
        )}
      >
        <Plus size={18} strokeWidth={2.25} className="shrink-0 text-text-muted" aria-hidden="true" />
        <input
          id="todo-quick-add"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a to-do and press Enter"
          className="min-w-0 flex-1 bg-transparent text-sm font-display font-medium text-text placeholder:text-text-muted outline-none"
        />
        {trimmed && (
          <span className="hidden lg:flex items-center gap-1 shrink-0 t-meta font-display font-semibold text-text-muted" aria-hidden="true">
            <CornerDownLeft size={12} />
            Enter
          </span>
        )}
      </label>

      <div className={cn('flex items-center gap-2', !touched && 'max-sm:hidden')}>
        <TodoDueMenu value={dueDate} onChange={setDueDate}>
          <button type="button" className={cn(CHIP_CLASS, dueDate && 'border-primary-500/40 bg-primary-500/10 text-primary-700 dark:text-primary-300')} aria-label={dueDate ? `Due ${dueLabel(dueDate)}. Change the due date` : 'Set a due date'}>
            <CalendarDays size={14} aria-hidden="true" />
            <span className="max-w-32 truncate">{dueDate ? dueLabel(dueDate) : 'Due date'}</span>
          </button>
        </TodoDueMenu>
        {dueDate && (
          <button
            type="button"
            onClick={() => setDueDate(null)}
            aria-label="Remove the due date"
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:size-11"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <TodoPriorityMenu value={priority} onChange={setPriority}>
          <button type="button" className={CHIP_CLASS} aria-label={`Priority ${PRIORITY_MAP[priority].label}. Change the priority`}>
            <span className={cn('flex size-4 items-center justify-center rounded-full text-white', PRIORITY_MAP[priority].solid)} aria-hidden="true">
              <PriorityIcon className="size-2.5" strokeWidth={2.75} />
            </span>
            {PRIORITY_MAP[priority].label}
          </button>
        </TodoPriorityMenu>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          isLoading={createMut.isPending}
          disabled={!trimmed}
          className="ml-auto h-9 shrink-0 rounded-lg px-4 font-display pointer-coarse:h-11 sm:ml-0"
        >
          Add
        </Button>
      </div>
    </form>
  );
};
