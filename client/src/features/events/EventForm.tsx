import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, AlertCircle, Tag, Clock3 } from 'lucide-react';
import { Input, Textarea, Button, Modal, Combobox, DatePicker } from '../../components';
import { useCreateEventMutation, useUpdateEventMutation } from './hook';
import { EVENT_TYPE_LABELS } from './eventDisplay';
import type { Event, EventType } from '@/api/events';

const EVENT_TYPES: EventType[] = ['DEADLINE', 'ANNOUNCEMENT', 'BROADCAST'];

// Combobox and DatePicker are bare controls with no label slot of their own (unlike Input/
// Textarea, which render one internally) — this matches their built-in label exactly
// (components/input/Input.tsx, components/textarea/Textarea.tsx) so Type and Date & time don't
// look like a different, hand-rolled field style sitting next to Title and Description.
const FIELD_LABEL_CLASS = 'flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-wide text-text-muted transition-colors duration-150 group-focus-within/field:text-primary-600 px-1';

// Quiet, borderless-until-interaction fill instead of a visible box outline at rest — the same
// Notion-inspired field treatment TicketForm.tsx and TaskForm.tsx both use (their own
// QUIET_FIELD_CLASS). This form had every field in the plain bordered-white style instead, which
// read as a plainer, older style sitting next to those two.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

const eventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.enum(['DEADLINE', 'ANNOUNCEMENT', 'BROADCAST']),
  eventDate: z.string().min(1, 'Date & time is required'),
});

type EventFields = z.infer<typeof eventSchema>;

interface EventFormProps {
  onClose: () => void;
  event?: Event;
}

export const EventForm = ({ onClose, event }: EventFormProps) => {
  const isEditing = !!event;
  const createMutation = useCreateEventMutation();
  const updateMutation = useUpdateEventMutation();
  const mutation = isEditing ? updateMutation : createMutation;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EventFields>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: event?.title ?? '',
      description: event?.description ?? '',
      type: event?.type ?? 'ANNOUNCEMENT',
      eventDate: event?.eventDate ?? '',
    },
  });

  const onSubmit = (data: EventFields) => {
    const payload = {
      title: data.title,
      description: data.description || undefined,
      type: data.type,
      eventDate: new Date(data.eventDate).toISOString(),
    };

    if (isEditing) {
      updateMutation.mutate({ id: event.id, payload }, { onSuccess: () => onClose() });
    } else {
      createMutation.mutate(payload, { onSuccess: () => onClose() });
    }
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="event-form" variant="primary" size="sm" isLoading={mutation.isPending}>
        {isEditing ? 'Save changes' : 'Create event'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      // No separate top-right X — the footer already has a dedicated Cancel button, same
      // convention as TicketForm/TaskForm's own create/edit modals.
      showCloseButton={false}
      // Draggable by its header, same as the Checklist/Ticket/Delegation Options dialogs.
      draggable
      // No divider under the header or above the footer — same seamless-card look
      // TicketForm/TaskForm use, instead of the header/body/footer reading as three stacked
      // boxes.
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      icon={<CalendarClock className="w-5 h-5" />}
      title={isEditing ? 'Edit event' : 'New event'}
      description="Deadlines, announcements, and broadcasts show up on everyone's dashboard."
      footer={footer}
    >
      <form id="event-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          id="title"
          label="Title"
          placeholder="e.g. Payroll cutoff"
          error={errors.title?.message}
          className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
          {...register('title')}
        />

        <div className="group/field flex flex-col gap-1.5">
          <label htmlFor="type" className={FIELD_LABEL_CLASS}>
            <Tag className="w-3.5 h-3.5 text-text-light group-focus-within/field:text-primary-500 transition-colors" strokeWidth={2.5} />
            Type
          </label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Combobox
                id="type"
                value={field.value}
                onChange={field.onChange}
                placeholder="Search type..."
                options={EVENT_TYPES.map(t => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
                className={QUIET_FIELD_CLASS}
              />
            )}
          />
        </div>

        <div className="group/field flex flex-col gap-1.5">
          {/* No htmlFor — DatePicker's trigger takes no id prop to point it at (DueDateField.tsx's
              own "Due date & time" label has the same gap). */}
          <label className={FIELD_LABEL_CLASS}>
            <Clock3 className="w-3.5 h-3.5 text-text-light group-focus-within/field:text-primary-500 transition-colors" strokeWidth={2.5} />
            Date &amp; time
          </label>
          {/* Same DatePicker every date field elsewhere in the app uses (e.g. Tickets' due date) —
              this used to be a raw native `datetime-local` input, which renders as an unstyled
              browser-default control (locale-dependent placeholder, no theming) next to every
              other themed field in this form. */}
          <Controller
            control={control}
            name="eventDate"
            render={({ field }) => (
              <DatePicker
                value={field.value ? new Date(field.value) : null}
                onChange={(date) => field.onChange(date ? date.toISOString() : '')}
                showTime
                placeholder="Select a date & time"
                className={QUIET_FIELD_CLASS}
              />
            )}
          />
          {errors.eventDate?.message && (
            <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-danger px-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
              {errors.eventDate.message}
            </p>
          )}
        </div>

        <Textarea
          id="description"
          label="Description"
          rows={3}
          placeholder="Optional details"
          className={QUIET_FIELD_CLASS}
          {...register('description')}
        />

        {/* Same treatment as TicketForm/TaskForm's own mutation-error box — this was a bare
            centered line of text, the one place in the form not matching the rest of the app's
            error styling. */}
        {mutation.isError && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20 text-xs text-danger font-display flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {mutation.error instanceof Error ? mutation.error.message : `Failed to ${isEditing ? 'update' : 'create'} event.`}
          </div>
        )}
      </form>
    </Modal>
  );
};
