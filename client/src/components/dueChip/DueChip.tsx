import { AlarmClockOff, CalendarClock, CalendarDays, Clock3, Hourglass, type LucideIcon } from 'lucide-react';
import { StatusBadge, type StatusVariant } from '../statusBadge';
import { dueInfo, waitInfo, type DueLevel, type WaitLevel } from './dueInfo';

const DUE_LOOK: Record<DueLevel, { icon: LucideIcon; variant: StatusVariant }> = {
  late: { icon: AlarmClockOff, variant: 'critical' },
  soon: { icon: Hourglass, variant: 'warning' },
  today: { icon: Clock3, variant: 'warning' },
  tomorrow: { icon: CalendarClock, variant: 'neutral' },
  later: { icon: CalendarDays, variant: 'neutral' },
};

const WAIT_VARIANT: Record<WaitLevel, StatusVariant> = {
  fresh: 'neutral',
  slow: 'warning',
  stuck: 'critical',
};

interface DueChipProps {
  at: number | string | Date;
  now: number;
  className?: string;
  plain?: boolean;
}

export const DueChip = ({ at, now, className, plain = false }: DueChipProps) => {
  const info = dueInfo(new Date(at).getTime(), now);
  const look = DUE_LOOK[info.level];
  return <StatusBadge variant={look.variant} icon={plain ? false : look.icon} label={info.label} className={className} />;
};

interface WaitChipProps {
  since: number | string | Date;
  now: number;
  warnAfterHours?: number;
  dangerAfterHours?: number;
  className?: string;
  plain?: boolean;
}

export const WaitChip = ({ since, now, warnAfterHours = 12, dangerAfterHours = 24, className, plain = false }: WaitChipProps) => {
  const info = waitInfo(new Date(since).getTime(), now, warnAfterHours, dangerAfterHours);
  return <StatusBadge variant={WAIT_VARIANT[info.level]} icon={plain ? false : Hourglass} label={info.label} className={className} />;
};
