import type { LucideIcon } from 'lucide-react';
import { Ban, CalendarOff, Clock3, History, Hourglass } from 'lucide-react';
import { IconChip } from '../../components';
import type { LeaveEntry } from '../../api/leave';
import { daysBetween, plural, statusKeyOf, type StatusKey } from './leaveDisplay';

interface ChipLook {
  icon: LucideIcon;
  tone: string;
  labelClassName?: string;
  label: (entry: LeaveEntry, today: string) => string;
}

const STARTS_IN = (entry: LeaveEntry, today: string) => {
  const diff = daysBetween(today, entry.startDate);
  return diff === 1 ? 'Starts tomorrow' : `Starts in ${diff} days`;
};

const CHIP_LOOK: Record<StatusKey, ChipLook> = {
  now: { icon: CalendarOff, tone: 'bg-vivid-blue', labelClassName: 'text-vivid-blue-text', label: () => 'On leave now' },
  coming: { icon: Clock3, tone: 'bg-vivid-sky', labelClassName: 'text-vivid-sky-text', label: STARTS_IN },
  recent: { icon: History, tone: 'bg-surface-hover/80', label: (entry, today) => `Ended ${plural(daysBetween(entry.endDate, today), 'day', 'days')} ago` },
  pending: { icon: Hourglass, tone: 'bg-warning', labelClassName: 'text-warning', label: () => 'Waiting for approval' },
  declined: { icon: Ban, tone: 'bg-danger', labelClassName: 'text-danger', label: () => 'Declined' },
};

export const LeaveStatusChip = ({ entry, today, iconOnlyOnMobile }: { entry: LeaveEntry; today: string; iconOnlyOnMobile?: boolean }) => {
  const look = CHIP_LOOK[statusKeyOf(entry, today)];
  return <IconChip icon={look.icon} tone={look.tone} label={look.label(entry, today)} labelClassName={look.labelClassName} iconOnlyOnMobile={iconOnlyOnMobile} />;
};
