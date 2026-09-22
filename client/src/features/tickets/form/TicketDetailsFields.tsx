import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Input, Textarea } from '../../../components';
import type { TicketFields } from './ticketFormSchema';

interface TicketDetailsFieldsProps {
  register: UseFormRegister<TicketFields>;
  errors: FieldErrors<TicketFields>;
}

// Quiet, borderless-until-interaction fill instead of a visible box outline at rest — matches the
// rest of this modal's Notion-inspired treatment. Only applied while the field has no error: the
// moment validation fails, Input/Textarea's own danger border+tint takes over instead, since that
// signal has to win over anything this modal adds on top.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

export const TicketDetailsFields = ({ register, errors }: TicketDetailsFieldsProps) => (
  <>
    <Input
      id="title"
      label="Title"
      placeholder="e.g. Fix authentication timeout on mobile"
      error={errors.title?.message}
      className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
      {...register('title')}
    />

    <Textarea
      id="description"
      label="Description"
      rows={3}
      placeholder="Describe the issue or expectations…"
      className={errors.description ? 'font-display' : QUIET_FIELD_CLASS}
      error={errors.description?.message}
      {...register('description')}
    />
  </>
);
