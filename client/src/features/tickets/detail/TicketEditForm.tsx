import { useState } from 'react';
import { Button, Input, DatePicker } from '../../../components';
import { TaskDescriptionField } from '../../tasks/TaskDescriptionField';
import { PrioritySegmented } from '../form/PrioritySegmented';
import type { TicketPriority } from '../form/formConstants';
import type { Ticket, UpdateTicketPayload } from '../../../api/ticket';

interface TicketEditFormProps {
  ticket: Ticket;
  isSaving: boolean;
  onSave: (payload: UpdateTicketPayload) => void;
  onCancel: () => void;
}

// Same minimums as the New ticket form, so an edit can't leave a ticket thinner than a new one.
const validate = (title: string, description: string) => ({
  title: title.trim().length < 5 ? 'Add a short title (at least 5 characters)' : undefined,
  description: description.trim().length < 10 ? 'Say a bit more about it (at least 10 characters)' : undefined,
});

const LABEL = 'text-xs sm:text-sm font-medium text-text-muted sm:text-text-secondary';

/** Edits the ticket's title, description, priority and due date in place of the read-only description. */
export const TicketEditForm = ({ ticket, isSaving, onSave, onCancel }: TicketEditFormProps) => {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? '');
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [submitted, setSubmitted] = useState(false);
  // The due moment is the ticket's TAT deadline. The server only takes it as "hours from now", so it
  // is turned into that on save (same conversion the New ticket form uses).
  const initialDue = ticket.tatDueAt ? new Date(ticket.tatDueAt) : null;
  const [due, setDue] = useState<Date | null>(initialDue);

  const errors = validate(title, description);
  const titleChanged = title.trim() !== ticket.title;
  const descriptionChanged = description.trim() !== (ticket.description ?? '').trim();
  const priorityChanged = priority !== ticket.priority;
  // Clearing the picker is not a change: the server has no way to remove a deadline once it is set.
  const dueChanged = !!due && due.getTime() !== (initialDue?.getTime() ?? null);
  // Decided when Save is pressed, not on every render: "still ahead" depends on the clock.
  const [dueError, setDueError] = useState<string | undefined>(undefined);
  const unchanged = !titleChanged && !descriptionChanged && !priorityChanged && !dueChanged;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const pastDue = dueChanged && !!due && due.getTime() <= Date.now();
    setDueError(pastDue ? 'Pick a time that is still ahead' : undefined);
    if (errors.title || errors.description || pastDue) return;
    if (unchanged) { onCancel(); return; }
    const payload: UpdateTicketPayload = {};
    if (titleChanged) payload.title = title.trim();
    if (descriptionChanged) payload.description = description.trim();
    if (priorityChanged) payload.priority = priority;
    if (dueChanged && due) payload.tatHours = Math.max(1, Math.ceil((due.getTime() - Date.now()) / 3_600_000));
    onSave(payload);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 min-w-0" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-ticket-title" className={LABEL}>Title</label>
        <Input
          id="edit-ticket-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={submitted ? errors.title : undefined}
          className="font-display"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-ticket-description" className={LABEL}>Description</label>
        <TaskDescriptionField
          id="edit-ticket-description"
          value={description}
          onChange={setDescription}
          rows={5}
          containerClassName={submitted && errors.description ? 'border-danger' : 'border-transparent bg-surface-hover/50 focus-within:bg-surface'}
        />
        {submitted && errors.description && <p className="text-xs text-danger font-display" role="alert">{errors.description}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Priority</span>
        <PrioritySegmented value={priority} onChange={setPriority} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Due</span>
        <DatePicker
          value={due}
          onChange={(d) => { setDue(d); setDueError(undefined); }}
          showTime
          defaultHour={18}
          minDate={new Date()}
          placeholder="Set a due date and time"
          triggerClassName="w-full h-11 sm:h-10 px-3 rounded-lg border-border/60 bg-surface hover:border-primary-400 text-sm"
        />
        {submitted && dueError ? (
          <p className="text-xs text-danger font-display" role="alert">{dueError}</p>
        ) : (
          <p className="text-xs text-text-muted font-display">
            {ticket.tatDueAt
              ? 'Changing it restarts the clock from now and clears any Delayed mark.'
              : 'Sets when the ticket should be finished by.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSaving} className="font-display max-sm:h-11">
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" isLoading={isSaving} className="font-display max-sm:h-11">
          Save changes
        </Button>
      </div>
    </form>
  );
};
