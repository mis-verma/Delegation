import { useState, type FormEvent } from 'react';
import { ListTodo } from 'lucide-react';
import { Button, Modal, Input, DatePicker } from '../../components';
import { TaskFormPrioritySelector } from '../tasks/TaskFormPrioritySelector';
import { TODO_QUIET_FIELD_CLASS, TODO_OPTIONAL_LABEL_CLASS } from './CreateTodoModal';
import { useUpdateTodoMutation } from './hook';
import type { Todo } from '../../api/todos';

interface EditTodoModalProps {
  todo: Todo;
  onClose: () => void;
}

// Same form shell/styling as CreateTodoModal (shares its field-wrapper/label constants) — kept as
// a separate component since it's opened from a single row's quick action with that row's todo
// already in hand, rather than the page-level "add" button's empty state.
export const EditTodoModal = ({ todo, onClose }: EditTodoModalProps) => {
  const [text, setText] = useState(todo.text);
  const [dueDate, setDueDate] = useState<Date | null>(todo.dueDate ? new Date(todo.dueDate) : null);
  const [priority, setPriority] = useState(todo.priority);
  const [error, setError] = useState<string | null>(null);

  const updateMut = useUpdateTodoMutation();

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Task is required');
      return;
    }
    updateMut.mutate(
      { id: todo.id, payload: { text: trimmed, priority, dueDate: dueDate ? dueDate.toISOString() : null } },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      bodyClassName="no-scrollbar"
      icon={<ListTodo className="w-6 h-6 text-primary-500" />}
      title={<span className="text-xl font-bold text-text">Edit todo task</span>}
      description={<span className="text-text-muted">A personal task, not assigned to anyone else.</span>}
      footer={
        <div className="flex w-full justify-end gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="todo-edit-form" variant="primary" size="sm" isLoading={updateMut.isPending}>
            Save changes
          </Button>
        </div>
      }
    >
      <form id="todo-edit-form" onSubmit={handleSave} className="flex flex-col gap-4 py-2" noValidate>
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

        <div className="flex flex-col gap-1.5">
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

        <TaskFormPrioritySelector value={priority} onChange={setPriority} />
      </form>
    </Modal>
  );
};