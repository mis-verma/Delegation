import { AlarmClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCountdown, formatClockTime, instanceClosing } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface LateWindowOverlayProps {
  instance: Pick<ChecklistInstance, 'periodStart' | 'periodEnd' | 'opensTime' | 'cutoffTime' | 'lateUntilTime'>;
  now: number;
  className?: string;
}

export const LateWindowOverlay = ({ instance, now, className }: LateWindowOverlayProps) => {
  if (!instance.lateUntilTime) return null;
  const remaining = instanceClosing(instance) - now;
  return (
    <div
      role="alert"
      className={cn('flex items-center justify-between gap-2 rounded-lg bg-linear-to-r from-danger to-danger/80 px-2.5 py-1.5 text-white', className)}
    >
      <span className="flex min-w-0 items-center gap-1.5 t-meta font-display font-bold">
        <AlarmClock size={14} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
        <span className="truncate">Overdue. Fill by {formatClockTime(instance.lateUntilTime)}</span>
      </span>
      <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 t-meta font-display font-bold tabular-nums">
        {formatCountdown(remaining)} left
      </span>
    </div>
  );
};
