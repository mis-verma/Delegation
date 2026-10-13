import { useState, type FormEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { ListTodo, Check, Type, SlidersHorizontal } from 'lucide-react';
import { Button, Modal, Input, DatePicker } from '../../components';
import { TaskPriorityChipPicker } from '../tasks/TaskPriorityChipPicker';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from '../tasks/taskFormFieldStyles';
import { useCreateTodoMutation, useUpdateTodoMutation } from './hook';
import type { Todo, TodoPriority } from '../../api/todos';

// Quiet fill until focused; Input's own danger styling takes over once validation fails.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

interface TodoFormModalProps {
  /** Omit to add a new to-do; pass one to edit it. */
  todo?: Todo;
  onClose: () => void;
}

/**
 * Add or edit a personal to-do. Same layout as the New delegation and New ticket forms: an icon
 * label over the text field, then one Details row of chips (priority, due date). Phones get the
 * X in the header and one full-width save button; desktop keeps Cancel.
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
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<ListTodo className="w-5 h-5" />}
      title={isEdit ? 'Edit to-do' : 'New to-do'}
      description={<span className="hidden sm:inline">Just for you. Nobody else sees your to-dos.</span>}
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
            {!isBusy && <Check size={16} strokeWidth={2.5} />}
            {isEdit ? 'Save' : 'Add to-do'}
          </Button>
        </div>
      }
    >
      <form id="todo-form" onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 pb-4 pt-0 sm:p-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="todo-text" className={DETAIL_HEADING_CLASS}>
            <Type size={14} className="text-text-light" />
            To-do <span className="text-danger">*</span>
          </label>
          <Input
            id="todo-text"
            autoFocus
            placeholder="e.g. Call the vendor about the display case"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            error={error ?? undefined}
            maxLength={200}
            className={error ? 'font-display' : QUIET_FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className={DETAIL_HEADING_CLASS}>
            <SlidersHorizontal size={14} className="text-text-light" />
            Details
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <TaskPriorityChipPicker value={priority} onChange={setPriority} disabled={isBusy} />
            <div title="Due date">
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                showTime
                placeholder="Add due date"
                // Room on the right for the picker's own clear (x) button once a date is set.
                className={`${CHIP_TRIGGER_CLASS} ${dueDate ? 'pr-10' : ''}`}
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};
