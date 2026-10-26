import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { haptic } from '../../lib/haptics';
import { clearKept, readKept, writeKept } from '../../lib/keptForm';
import { useAuth } from '../../context/AuthContext';
import { ListTodo, Check, Circle, CalendarDays, Lock, Flag, Trash2, CircleCheck } from 'lucide-react';
import { Button, Modal, DateRangePicker, type DateRangeValue } from '../../components';
import { QuickDueOptions } from '../tickets/form/QuickDueOptions';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { useCreateTodoMutation, useUpdateTodoMutation, useDeleteTodoMutation } from './hook';
import type { Todo, TodoPriority } from '../../api/todos';

interface TodoFormModalProps {
  todo?: Todo;
  onClose: () => void;
}

const PRIORITIES: TodoPriority[] = ['low', 'medium', 'high'];

const SECTION_LABEL = 'flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary';
const PILL_ON = 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300';
const PILL_OFF = 'border-border/60 bg-surface text-text-secondary hover:border-border-hover';

interface KeptTodo {
  text?: string;
  priority?: TodoPriority;
  dueDate?: string | null;
}

export const TodoFormModal = ({ todo, onClose }: TodoFormModalProps) => {
  const isEdit = !!todo;
  const { user } = useAuth();
  const keptKey = `todo:${user?.id ?? 'anon'}`;
  const [kept] = useState(() => (todo ? null : readKept<KeptTodo>(keptKey)));
  const [text, setText] = useState(todo?.text ?? kept?.text ?? '');
  const [dueDate, setDueDate] = useState<Date | null>(todo?.dueDate ? new Date(todo.dueDate) : kept?.dueDate ? new Date(kept.dueDate) : null);
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? kept?.priority ?? 'medium');
  const [completed, setCompleted] = useState(todo?.completed ?? false);
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateTodoMutation();
  const updateMut = useUpdateTodoMutation();
  const deleteMut = useDeleteTodoMutation();
  const isBusy = createMut.isPending || updateMut.isPending;

  const finish = () => {
    clearKept(keptKey);
    onClose();
  };

  useEffect(() => {
    if (isEdit) return undefined;
    const timer = setTimeout(() => {
      if (text.trim()) writeKept(keptKey, { text, priority, dueDate: dueDate ? dueDate.toISOString() : null });
      else clearKept(keptKey);
    }, 400);
    return () => clearTimeout(timer);
  }, [isEdit, keptKey, text, priority, dueDate]);

  useEffect(() => {
    if (!kept?.text) return;
    toast.info('Brought back what you were typing.', {
      action: {
        label: 'Start over',
        onClick: () => {
          clearKept(keptKey);
          setText('');
          setDueDate(null);
          setPriority('medium');
        },
      },
    });
  }, [kept, keptKey]);

  const savedDue = todo?.dueDate ? new Date(todo.dueDate).toISOString() : null;
  const isDirty = todo
    ? text.trim() !== todo.text || priority !== todo.priority || completed !== todo.completed || (dueDate?.toISOString() ?? null) !== savedDue
    : text.trim().length > 0 || dueDate !== null;

  const handleDelete = () => {
    if (!todo) return;
    deleteMut.mutate(todo.id);
    finish();
  };

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
        { id: todo.id, payload: { text: trimmed, priority, completed, dueDate: dueDate ? dueDate.toISOString() : null } },
        { onSuccess: finish },
      );
    } else {
      createMut.mutate(
        { text: trimmed, priority, dueDate: dueDate ? dueDate.toISOString() : undefined },
        { onSuccess: () => { haptic('success'); finish(); } },
      );
    }
  };

  const dueOverdue = !!dueDate && dueDate < new Date() && !completed;

  return (
    <Modal
      open
      onClose={finish}
      size="md"
      icon={<ListTodo className="w-5 h-5" />}
      title={isEdit ? 'Edit to-do' : 'New to-do'}
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      closeButtonClassName="sm:hidden"
      dirty={isDirty && !isBusy}
      footer={
        <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
          {todo && (
            <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={isBusy} className="mr-auto font-display text-danger hover:bg-danger/10 max-sm:h-11">
              <Trash2 size={15} aria-hidden="true" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={finish} disabled={isBusy} className="hidden sm:inline-flex font-display">
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
            {text.length > 150 && <span className="t-meta tabular-nums text-text-muted">{text.length}/200</span>}
          </div>
        </div>

        {isEdit && (
          <button
            type="button"
            role="checkbox"
            aria-checked={completed}
            onClick={() => setCompleted((v) => !v)}
            disabled={isBusy}
            className={cn(
              'flex items-center gap-2.5 min-h-11 sm:min-h-10 px-3 rounded-xl border t-meta font-display font-semibold text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]',
              completed ? 'border-success/40 bg-success/10 text-success' : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover',
            )}
          >
            <CircleCheck size={16} aria-hidden="true" />
            {completed ? 'Marked as done' : 'Mark as done'}
          </button>
        )}

        <div className="flex flex-col gap-2">
          <span className={SECTION_LABEL}><CalendarDays size={13} className="text-text-light" aria-hidden="true" />Due</span>
          <QuickDueOptions value={dueDate} onPick={setDueDate} />
          <DateRangePicker
            tiles
            showTime
            hidePresets
            dueOnly
            value={{ from: null, to: dueDate }}
            onChange={(range: DateRangeValue) => setDueDate(range.to)}
            minDate={new Date()}
            invalid={dueOverdue}
            placeholder="Choose a due day"
          />
          {!dueDate && <p className="t-meta text-text-muted">No due date. Pick one, or leave it open.</p>}
          {dueOverdue && <p className="t-meta font-semibold text-danger">This time has already passed.</p>}
        </div>

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

        <p className="flex items-center gap-1.5 t-meta text-text-muted">
          <Lock size={11} aria-hidden="true" />
          Only you see your to-dos.
        </p>
      </form>
    </Modal>
  );
};
