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
  tone?: 'auto' | 'danger';
  bare?: boolean;
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

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${done} of ${total} done`}
        className={cn("flex-1 bg-surface-hover rounded-full overflow-hidden", thin ? "h-1.5" : "h-2")}
      >
        <div
          className={cn("h-full w-full rounded-full origin-left transition-transform duration-500 ease-out", fill)}
          style={{ transform: `scaleX(${done > 0 ? Math.max(percent, 4) / 100 : 0})` }}
        />
      </div>

      {!bare && (
        <span
          className={cn(
            "t-meta font-bold tabular-nums tracking-wider shrink-0 transition-colors duration-500",
            complete ? "text-success" : "text-text-muted"
          )}
        >
          {done}/{total}
        </span>
      )}
    </div>
  );
};
