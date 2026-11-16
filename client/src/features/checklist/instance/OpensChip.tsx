import { CalendarClock } from 'lucide-react';
import { IconChip } from '../../../components';

interface OpensChipProps {
  opensOn: string | null;
  dueInDays: number | null;
}

export const OpensChip = ({ opensOn, dueInDays }: OpensChipProps) => {
  if (dueInDays !== null) return <IconChip icon={CalendarClock} tone="bg-primary-600" label={`Opens early · Due in ${dueInDays}d`} />;
  return opensOn ? <IconChip icon={CalendarClock} tone="bg-primary-600" label={`Opens ${opensOn}`} /> : null;
};
