import { useState, type FormEvent } from 'react';
import { Plus, CornerDownLeft } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import { useCreateTodoMutation } from './hook';

const MAX_LENGTH = 200;

export const TodoQuickAdd = () => {
  const [text, setText] = useState('');
  const createMut = useCreateTodoMutation();
  const trimmed = text.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || createMut.isPending) return;
    createMut.mutate({ text: trimmed, priority: 'medium' }, { onSuccess: () => setText('') });
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2" aria-label="Add a to-do">
      <label
        htmlFor="todo-quick-add"
        className={cn(
          'flex flex-1 min-w-0 items-center gap-3 h-12 px-3.5 rounded-2xl border bg-surface cursor-text transition-colors duration-150',
          'border-border/60 hover:border-border-hover focus-within:border-primary-400',
        )}
      >
        <Plus size={18} strokeWidth={2.25} className="shrink-0 text-text-light" aria-hidden="true" />
        <input
          id="todo-quick-add"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a to-do and press Enter"
          className="min-w-0 flex-1 bg-transparent text-sm font-display font-medium text-text placeholder:text-text-light outline-none"
        />
        {trimmed && (
          <span className="hidden sm:flex items-center gap-1 shrink-0 t-meta font-display font-semibold text-text-muted" aria-hidden="true">
            <CornerDownLeft size={12} />
            Enter
          </span>
        )}
      </label>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        isLoading={createMut.isPending}
        disabled={!trimmed}
        className={cn('h-12 shrink-0 rounded-2xl px-4 font-display', !trimmed && 'max-sm:hidden')}
      >
        Add
      </Button>
    </form>
  );
};
