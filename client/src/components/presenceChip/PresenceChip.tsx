import { Clock, Radio, UserX } from 'lucide-react';
import { IconChip } from '../iconChip';

interface PresenceChipProps {
  /** undefined while live status is still loading. */
  online?: boolean;
  /** "Active 2h ago", "Never active" or "Active now" (see presenceLabel). Empty while loading. */
  text: string;
  /** A switched-off account: shows the deactivated chip instead of a presence state. */
  deactivated?: boolean;
  deactivatedLabel?: string;
  className?: string;
}

/** Online now / last seen / never active / deactivated, in the same chip language as the status and role chips. */
export const PresenceChip = ({ online, text, deactivated = false, deactivatedLabel = 'Deactivated', className }: PresenceChipProps) => {
  if (deactivated) return <IconChip icon={UserX} tone="bg-text-muted" label={deactivatedLabel} className={className} />;
  if (online) return <IconChip icon={Radio} tone="bg-success" label="Online now" className={className} />;
  if (!text) return null;
  return <IconChip icon={Clock} tone="bg-text-light" label={text} className={className} />;
};
