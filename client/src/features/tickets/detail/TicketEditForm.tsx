import { useEffect, useRef, useState } from 'react';
import { Type, AlignLeft, Flag, Clock } from 'lucide-react';
import { Input } from '../../../components';
import { TaskDescriptionField } from '../../tasks/TaskDescriptionField';
import { FormField } from '../form/FormField';
import { DueDateField } from '../form/DueDateField';
import { TicketPriorityChipPicker } from '../form/TicketPriorityChipPicker';
import type { TicketPriority } from '../form/formConstants';
import { hoursUntil } from '../ticketDisplay';
import type { Ticket, UpdateTicketPayload } from '../../../api/ticket';

interface TicketEditFormProps {
  ticket: Ticket;
  formId: string;
  canChangeDue: boolean;
  canChangePriority: boolean;
  onSave: (payload: UpdateTicketPayload) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const validate = (title: string, description: string) => ({
  title: title.trim().length < 5 ? 'Add a short title (at least 5 characters)' : undefined,
  description: description.trim().length < 10 ? 'Say a bit more about it (at least 10 characters)' : undefined,
});

export const TicketEditForm = ({ ticket, formId, canChangeDue, canChangePriority, onSave, onCancel, onDirtyChange }: TicketEditFormProps) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? '');
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [submitted, setSubmitted] = useState(false);
  const [autoFocus] = useState(() => !window.matchMedia('(pointer: coarse)').matches);
  const [initialDue] = useState(() => (ticket.tatDueAt ? new Date(ticket.tatDueAt) : null));
  const [initialStart] = useState(() => (ticket.startDate ? new Date(ticket.startDate) : null));
  const [due, setDue] = useState<Date | null>(initialDue);
  const [start, setStart] = useState<Date | null>(initialStart);
  const [dueError, setDueError] = useState<string | undefined>(undefined);

  const errors = validate(title, description);
  const titleChanged = title.trim() !== ticket.title;
  const descriptionChanged = description.trim() !== (ticket.description ?? '').trim();
  const priorityChanged = canChangePriority && priority !== ticket.priority;
  const dueChanged = canChangeDue && !!due && due.getTime() !== (initialDue?.getTime() ?? null);
  const startChanged = canChangeDue && (start?.getTime() ?? null) !== (initialStart?.getTime() ?? null);
  const unchanged = !titleChanged && !descriptionChanged && !priorityChanged && !dueChanged && !startChanged;

  useEffect(() => {
    onDirtyChange(!unchanged);
  }, [unchanged, onDirtyChange]);

  const scrollToFirstError = (field: string) => {
    const anchor = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!anchor) return;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    anchor.querySelector<HTMLElement>('input:not([type="file"]), textarea, button')?.focus({ preventScroll: true });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const pastDue = dueChanged && !!due && due.getTime() <= Date.now();
    const startAfterDue = canChangeDue && !!start && !!due && start.getTime() > due.getTime();
    const nextDueError = pastDue
      ? 'Pick a time that is still ahead'
      : startAfterDue ? 'The start has to be before the due time' : undefined;
    setDueError(nextDueError);
    const firstError = errors.title ? 'title' : errors.description ? 'description' : nextDueError ? 'due' : null;
    if (firstError) {
      scrollToFirstError(firstError);
      return;
    }
    if (unchanged) { onCancel(); return; }
    const payload: UpdateTicketPayload = {};
    if (titleChanged) payload.title = title.trim();
    if (descriptionChanged) payload.description = description.trim();
    if (priorityChanged) payload.priority = priority;
    if (dueChanged && due) payload.tatHours = hoursUntil(due);
    if (startChanged) payload.startDate = start ? start.toISOString() : null;
    onSave(payload);
  };

  return (
    <form ref={formRef} id={formId} onSubmit={submit} className="flex flex-col gap-5 min-w-0" noValidate>
      <div data-field="title">
        <FormField
          label="Title"
          htmlFor="edit-ticket-title"
          icon={<Type size={14} className="text-text-light" />}
          required
          error={submitted ? errors.title : undefined}
        >
          <Input
            id="edit-ticket-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-display"
            autoFocus={autoFocus}
          />
        </FormField>
      </div>

      <div data-field="description">
        <FormField
          label="Description"
          htmlFor="edit-ticket-description"
          icon={<AlignLeft size={14} className="text-text-light" />}
          required
          error={submitted ? errors.description : undefined}
        >
          <TaskDescriptionField
            id="edit-ticket-description"
            value={description}
            onChange={setDescription}
            rows={5}
            containerClassName={submitted && errors.description ? 'border-danger' : 'border-transparent bg-surface-hover/50 focus-within:bg-surface'}
          />
        </FormField>
      </div>

      {canChangePriority && (
        <FormField
          label="Priority"
          icon={<Flag size={14} className="text-text-light" />}
          hint="Critical is for work that has stopped. Most tickets are Medium."
        >
          <TicketPriorityChipPicker fullWidth value={priority} onChange={setPriority} />
        </FormField>
      )}

      {canChangeDue && (
        <div data-field="due">
          <FormField
            label="Due"
            icon={<Clock size={14} className="text-text-light" />}
            hint={ticket.tatDueAt
              ? 'Changing it restarts the clock from now and clears the Late mark.'
              : 'When the ticket should be finished by.'}
            error={submitted ? dueError : undefined}
          >
            <DueDateField
              due={due}
              onDueChange={(d) => { setDue(d); setDueError(undefined); }}
              canSetStart
              start={start}
              onStartChange={(d) => { setStart(d); setDueError(undefined); }}
              invalid={submitted && !!dueError}
            />
          </FormField>
        </div>
      )}
    </form>
  );
};
