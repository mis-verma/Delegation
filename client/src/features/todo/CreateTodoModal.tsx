import { useState, type FormEvent } from 'react';
import { ListTodo } from 'lucide-react';
import { Button, Modal, Input, DatePicker } from '../../components';
import { TaskFormPrioritySelector } from '../tasks/TaskFormPrioritySelector';
import { useCreateTodoMutation } from './hook';
import type { TodoPriority } from '../../api/todos';

interface CreateTodoModalProps {
  open: boolean;
  onClose: () => void;
}

// Quiet, borderless-until-interaction fill instead of a visible bordered box at rest — same
// Notion-inspired treatment the Create Ticket/Task modals already use (see
// TicketDetailsFields.tsx's identical QUIET_FIELD_CLASS), shared with EditTodoModal so create and
// edit read as one consistent form language. This replaced a per-field `p-4 border rounded-xl`
// card wrapper around every field — a heavier "box-in-box" look this modal was the last one still
// wearing after the rest of the app's forms moved on. Only applied while the field has no error:
// the moment validation fails, Input's own danger border+tint takes over instead.
export const TODO_QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

// Plain label for a field not wrapped by Input (Input renders its own) — same reference as the
// Create Ticket modal's DueDateField, quiet text with no box or bold weight.
export const TODO_FIELD_LABEL_CLASS = 'text-xs font-medium text-text-secondary';

// "Due date & time (optional)" — the two parts sit in a flex row with a gap rather than the
// optional-tag carrying its own `ml-1`, per the no-sibling-margins rule.
export const TODO_OPTIONAL_LABEL_CLASS = `flex items-center gap-1.5 ${TODO_FIELD_LABEL_CLASS}`;

export const CreateTodoModal = ({ open, onClose }: CreateTodoModalProps) => {
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateTodoMutation();

  if (!open) return null;

  const closeAndReset = () => {
    onClose();
    setText('');
    setDueDate(null);
    setPriority('medium');
    setError(null);
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Task is required');
      return;
    }
    createMut.mutate(
      { text: trimmed, priority, dueDate: dueDate ? dueDate.toISOString() : undefined },
      { onSuccess: closeAndReset }
    );
  };

  return (
    <Modal
      open
      onClose={closeAndReset}
      size="xl"
      bodyClassName="no-scrollbar"
      icon={<ListTodo className="w-6 h-6 text-primary-500" />}
      title={<span className="text-xl font-bold text-text">New todo task</span>}
      description={<span className="text-text-muted">A personal task, not assigned to anyone else.</span>}
      footer={
        <div className="flex w-full justify-end gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={closeAndReset}>
            Cancel
          </Button>
          <Button type="submit" form="todo-form" variant="primary" size="sm" isLoading={createMut.isPending}>
            Add task
          </Button>
        </div>
      }
    >
      <form id="todo-form" onSubmit={handleCreate} className="flex flex-col gap-4 py-2" noValidate>
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
          <Input
            autoFocus
            label="What needs to be done?"
            placeholder="e.g. Follow up with the vendor"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            error={error ?? undefined}
            maxLength={200}
            className={error ? 'font-display' : TODO_QUIET_FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '75ms', animationFillMode: 'backwards' }}>
          <label className={TODO_OPTIONAL_LABEL_CLASS}>
            Due date &amp; time <span className="text-text-light font-normal">(optional)</span>
          </label>
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            showTime
            placeholder="No due date set"
            triggerClassName={TODO_QUIET_FIELD_CLASS}
          />
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}>
          <TaskFormPrioritySelector value={priority} onChange={setPriority} />
        </div>
      </form>
    </Modal>
  );
};