import { AlarmClockOff, CalendarClock, CalendarDays, Clock3, Hourglass, type LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { dueInfo, waitInfo, type DueLevel, type WaitLevel } from './dueInfo';

interface ChipLook {
  icon: LucideIcon;
  tone: string;
  text?: string;
}

const DUE_LOOK: Record<DueLevel, ChipLook> = {
  late: { icon: AlarmClockOff, tone: 'bg-danger', text: 'text-danger' },
  soon: { icon: Hourglass, tone: 'bg-warning', text: 'text-warning' },
  today: { icon: Clock3, tone: 'bg-warning', text: 'text-warning' },
  tomorrow: { icon: CalendarClock, tone: 'bg-primary-600 dark:bg-primary-400' },
  later: { icon: CalendarDays, tone: 'bg-text-muted' },
};

const WAIT_LOOK: Record<WaitLevel, ChipLook> = {
  fresh: { icon: Hourglass, tone: 'bg-text-muted' },
  slow: { icon: Hourglass, tone: 'bg-warning', text: 'text-warning' },
  stuck: { icon: Hourglass, tone: 'bg-danger', text: 'text-danger' },
};

interface DueChipProps {
  at: number | string | Date;
  now: number;
  className?: string;
  plain?: boolean;
}

export const DueChip = ({ at, now, className }: DueChipProps) => {
  const info = dueInfo(new Date(at).getTime(), now);
  const look = DUE_LOOK[info.level];
  return <IconChip icon={look.icon} tone={look.tone} label={info.label} labelClassName={look.text} className={className} />;
};

interface WaitChipProps {
  since: number | string | Date;
  now: number;
  warnAfterHours?: number;
  dangerAfterHours?: number;
  className?: string;
  plain?: boolean;
}

export const WaitChip = ({ since, now, warnAfterHours = 12, dangerAfterHours = 24, className }: WaitChipProps) => {
  const info = waitInfo(new Date(since).getTime(), now, warnAfterHours, dangerAfterHours);
  const look = WAIT_LOOK[info.level];
  return <IconChip icon={look.icon} tone={look.tone} label={info.label} labelClassName={look.text} className={className} />;
};
