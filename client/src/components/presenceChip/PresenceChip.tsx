import { Clock, Radio, UserX } from 'lucide-react';
import { IconChip } from '../iconChip';

interface PresenceChipProps {
  online?: boolean;
  text: string;
  deactivated?: boolean;
  deactivatedLabel?: string;
  className?: string;
}

export const PresenceChip = ({ online, text, deactivated = false, deactivatedLabel = 'Deactivated', className }: PresenceChipProps) => {
  if (deactivated) return <IconChip icon={UserX} tone="bg-text-muted" label={deactivatedLabel} className={className} />;
  if (online) return <IconChip icon={Radio} tone="bg-success" label="Online now" className={className} />;
  if (!text) return null;
  return <IconChip icon={Clock} tone="bg-text-light" label={text} className={className} />;
};
