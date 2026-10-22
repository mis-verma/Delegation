import { AlarmClockOff, CalendarClock, CalendarDays, Clock3, Hourglass, type LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { cn } from '@/lib/utils';
import { dueInfo, waitInfo, type DueLevel, type WaitLevel } from './dueInfo';

const DUE_LOOK: Record<DueLevel, { icon: LucideIcon; tone: string; text: string; box: string }> = {
  late: { icon: AlarmClockOff, tone: 'bg-danger', text: 'text-danger', box: 'border-danger/30 bg-danger/10' },
  soon: { icon: Hourglass, tone: 'bg-warning', text: 'text-warning', box: 'border-warning/30 bg-warning/10' },
  today: { icon: Clock3, tone: 'bg-primary-600', text: 'text-primary-700 dark:text-primary-300', box: 'border-primary-500/25 bg-primary-500/10' },
  tomorrow: { icon: CalendarClock, tone: 'bg-info', text: 'text-info', box: 'border-info/25 bg-info/10' },
  later: { icon: CalendarDays, tone: 'bg-text-muted', text: 'text-text-secondary', box: '' },
};

const WAIT_LOOK: Record<WaitLevel, { tone: string; text: string; box: string }> = {
  fresh: { tone: 'bg-text-muted', text: 'text-text-secondary', box: '' },
  slow: { tone: 'bg-warning', text: 'text-warning', box: 'border-warning/30 bg-warning/10' },
  stuck: { tone: 'bg-danger', text: 'text-danger', box: 'border-danger/30 bg-danger/10' },
};

interface DueChipProps {
  at: number | string | Date;
  now: number;
  className?: string;
}

export const DueChip = ({ at, now, className }: DueChipProps) => {
  const info = dueInfo(new Date(at).getTime(), now);
  const look = DUE_LOOK[info.level];
  return (
    <IconChip
      icon={look.icon}
      tone={look.tone}
      label={info.label}
      labelClassName={cn('tabular-nums', look.text)}
      className={cn('shrink-0', look.box, className)}
    />
  );
};

interface WaitChipProps {
  since: number | string | Date;
  now: number;
  warnAfterHours?: number;
  dangerAfterHours?: number;
  className?: string;
}

export const WaitChip = ({ since, now, warnAfterHours = 12, dangerAfterHours = 24, className }: WaitChipProps) => {
  const info = waitInfo(new Date(since).getTime(), now, warnAfterHours, dangerAfterHours);
  const look = WAIT_LOOK[info.level];
  return (
    <IconChip
      icon={Hourglass}
      tone={look.tone}
      label={info.label}
      labelClassName={cn('tabular-nums', look.text)}
      className={cn('shrink-0', look.box, className)}
    />
  );
};
