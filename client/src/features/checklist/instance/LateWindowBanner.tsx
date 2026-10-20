import { AlarmClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip } from '../../../components';
import { formatCountdown, instanceClosing, formatClockTime } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface LateWindowBannerProps {
  instance: Pick<ChecklistInstance, 'periodStart' | 'periodEnd' | 'opensTime' | 'cutoffTime' | 'lateUntilTime'>;
  now: number;
  onFill?: () => void;
  className?: string;
}

export const LateWindowBanner = ({ instance, now, onFill, className }: LateWindowBannerProps) => {
  if (!instance.lateUntilTime) return null;
  const remaining = instanceClosing(instance) - now;
  return (
    <div
      role="alert"
      className={cn('flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4', className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-danger to-danger/70 text-white" aria-hidden="true">
          <AlarmClock className="size-5" strokeWidth={2.25} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="t-card font-display font-bold text-danger">Overdue. Please fill this in now.</p>
          <p className="t-meta font-display text-text-secondary">
            The closing time has passed, but you can still fill it in until {formatClockTime(instance.lateUntilTime)}. It will count as filled late.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <IconChip icon={AlarmClock} tone="bg-danger" label={`${formatCountdown(remaining)} left`} labelClassName="tabular-nums" />
        {onFill && (
          <button
            type="button"
            onClick={onFill}
            className="inline-flex h-11 cursor-pointer items-center rounded-lg bg-danger px-4 t-meta font-display font-semibold text-white outline-none transition-colors hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/40 sm:h-9"
          >
            Fill it now
          </button>
        )}
      </div>
    </div>
  );
};
