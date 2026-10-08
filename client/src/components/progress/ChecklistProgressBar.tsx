import { CheckSquare } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChecklistProgressBarProps {
  done: number;
  total: number;
  className?: string;
  /** 'danger' turns the fill red (an overdue run); 'auto' is green when complete, primary otherwise. */
  tone?: 'auto' | 'danger';
  /** Hide the leading check icon and the done/total counter for a bare bar. */
  bare?: boolean;
  /** Track height. Defaults to the 8px bar. */
  thin?: boolean;
}

export const ChecklistProgressBar = ({ done, total, className, tone = 'auto', bare = false, thin = false }: ChecklistProgressBarProps) => {
  if (total === 0) return null;
  const percent = Math.round((done / total) * 100);
  const complete = done === total && total > 0;

  const fill = tone === 'danger' ? 'bg-danger' : complete ? 'bg-success' : 'bg-primary-500';

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {!bare && (
        <CheckSquare
          size={14}
          strokeWidth={2.5}
          className={cn(
            "shrink-0 transition-colors duration-500",
            complete ? "text-success" : "text-text-light"
          )}
        />
      )}

      {/* Progress Track: theme token, not raw slate, so it stays soft in dark mode instead of a
          fixed light-gray track sitting on a dark card. Fill animates with scaleX (compositor only),
          not width, so a tick-off never triggers layout. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={cn("flex-1 bg-surface-hover rounded-full overflow-hidden", thin ? "h-1.5" : "h-2")}
      >
        <div
          className={cn("h-full w-full rounded-full origin-left transition-transform duration-500 ease-out", fill)}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>

      {!bare && (
        <span
          className={cn(
            "text-[0.6875rem] font-bold tabular-nums tracking-wider shrink-0 transition-colors duration-500",
            complete ? "text-success" : "text-text-muted"
          )}
        >
          {done}/{total}
        </span>
      )}
    </div>
  );
};
