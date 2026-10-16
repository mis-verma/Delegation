import { useState, type FormEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { ListTodo, Check, Circle, CalendarDays, Lock, Flag } from 'lucide-react';
import { Button, Modal, DatePicker } from '../../components';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useCreateTodoMutation, useUpdateTodoMutation } from './hook';
import type { Todo, TodoPriority } from '../../api/todos';

interface TodoFormModalProps {
  /** Omit to add a new to-do; pass one to edit it. */
  todo?: Todo;
  onClose: () => void;
}

const PRIORITIES: TodoPriority[] = ['low', 'medium', 'high'];

// Quick due dates, at 6 pm that day (the same evening default the calendar uses for a new item).
const at6pm = (daysFromToday: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(18, 0, 0, 0);
  return d;
};
const sameDay = (a: Date | null, b: Date) => !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const QUICK_DUE: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
];

const SECTION_LABEL = 'flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary';
const PILL = 'inline-flex items-center gap-1.5 h-8 pointer-coarse:h-9 px-2.5 rounded-full border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97]';
const PILL_ON = 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300';
const PILL_OFF = 'border-border/60 bg-surface text-text-secondary hover:border-border-hover';

/**
 * Add or edit a personal to-do, kept as simple as a note: one line to write it (a round check in front, like a
 * to-do app), a row of quick due dates with a full picker beside them, and the three priorities as pills. Only the
 * person sees their to-dos, which a small line at the bottom says.
 */
export const TodoFormModal = ({ todo, onClose }: TodoFormModalProps) => {
  const isEdit = !!todo;
  const [text, setText] = useState(todo?.text ?? '');
  const [dueDate, setDueDate] = useState<Date | null>(todo?.dueDate ? new Date(todo.dueDate) : null);
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? 'medium');
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateTodoMutation();
  const updateMut = useUpdateTodoMutation();
  const isBusy = createMut.isPending || updateMut.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Write what needs doing first.');
      haptic('error');
      return;
    }
    if (todo) {
      updateMut.mutate(
        { id: todo.id, payload: { text: trimmed, priority, dueDate: dueDate ? dueDate.toISOString() : null } },
        { onSuccess: onClose },
      );
    } else {
      createMut.mutate(
        { text: trimmed, priority, dueDate: dueDate ? dueDate.toISOString() : undefined },
        { onSuccess: () => { haptic('success'); onClose(); } },
      );
    }
  };

  const quickPicked = QUICK_DUE.find((q) => sameDay(dueDate, at6pm(q.days)));

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<ListTodo className="w-5 h-5" />}
      title={isEdit ? 'Edit to-do' : 'New to-do'}
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      closeButtonClassName="sm:hidden"
      footer={
        <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isBusy} className="hidden sm:inline-flex font-display">
            Cancel
          </Button>
          <Button type="submit" form="todo-form" variant="primary" size="sm" isLoading={isBusy} className="max-sm:flex-1 max-sm:h-11 font-display">
            {!isBusy && <Check size={15} strokeWidth={2.5} />}
            {isEdit ? 'Save' : 'Add to-do'}
          </Button>
        </div>
      }
    >
      <form id="todo-form" onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-3 pt-0 sm:px-5" noValidate>
        {/* The to-do itself: one roomy line with a round check in front, as in a to-do app. */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="todo-text"
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-150 cursor-text focus-within:border-primary-400 focus-within:bg-surface',
              error ? 'border-danger bg-danger/5' : 'border-border/60 bg-surface-hover/40',
            )}
          >
            <Circle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-text-light" aria-hidden="true" />
            <textarea
              id="todo-text"
              autoFocus
              rows={2}
              placeholder="What needs doing? e.g. Call the vendor about the display case"
              value={text}
              onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
              maxLength={200}
              aria-invalid={!!error}
              aria-describedby={error ? 'todo-error' : undefined}
              className="min-w-0 flex-1 resize-none bg-transparent text-sm font-display font-medium leading-relaxed text-text placeholder:text-text-light outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-2 px-1">
            {error ? <p id="todo-error" role="alert" className="t-meta font-semibold text-danger">{error}</p> : <span />}
            {text.length > 150 && <span className="text-[0.6875rem] tabular-nums text-text-muted">{text.length}/200</span>}
          </div>
        </div>

        {/* When: three quick days, then any date and time. */}
        <div className="flex flex-col gap-2">
          <span className={SECTION_LABEL}><CalendarDays size={13} className="text-text-light" aria-hidden="true" />Due</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_DUE.map((q) => {
              const on = quickPicked?.days === q.days;
              return (
                <button key={q.label} type="button" aria-pressed={on} onClick={() => setDueDate(on ? null : at6pm(q.days))} className={cn(PILL, on ? PILL_ON : PILL_OFF)}>
                  {on && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                  {q.label}
                </button>
              );
            })}
            <div title="Pick a date and time">
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                showTime
                placeholder="Pick date"
                className={cn(PILL, 'w-auto shadow-none', dueDate && !quickPicked ? PILL_ON : PILL_OFF, dueDate ? 'pr-9' : '')}
              />
            </div>
          </div>
        </div>

        {/* How much it matters: the three levels as coloured pills. */}
        <div className="flex flex-col gap-2">
          <span className={SECTION_LABEL}><Flag size={13} className="text-text-light" aria-hidden="true" />Priority</span>
          <div role="radiogroup" aria-label="Priority" className="grid grid-cols-3 gap-1.5">
            {PRIORITIES.map((p) => {
              const meta = PRIORITY_MAP[p];
              const Icon = meta.icon;
              const on = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPriority(p)}
                  disabled={isBusy}
                  className={cn('flex items-center justify-center gap-1.5 h-9 pointer-coarse:h-10 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40', on ? PILL_ON : PILL_OFF)}
                >
                  <span className={cn('flex size-5 items-center justify-center rounded-full text-white', meta.solid)} aria-hidden="true">
                    <Icon className="size-3" strokeWidth={2.75} />
                  </span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-[0.6875rem] text-text-muted">
          <Lock size={11} aria-hidden="true" />
          Only you see your to-dos.
        </p>
      </form>
    </Modal>
  );
};
