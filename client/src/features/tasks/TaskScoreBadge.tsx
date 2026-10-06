import { TASK_SCORE, taskScorePercent } from './taskDisplay';
import { cn } from '@/lib/utils';
import type { Task } from '../../api/task';

// Done is green, anything underway is the app's blue, not started is neutral grey.
const scoreColor = (status: Task['status']) => {
  const score = TASK_SCORE[status];
  if (score >= 1) return 'text-success';
  if (score > 0) return 'text-primary-600 dark:text-primary-400';
  return 'text-text-light';
};

interface RingProps {
  percent: number;
  size: number;
  stroke: number;
  className?: string;
}

// A small progress ring: a faint full circle with the earned part drawn over it.
const ScoreRing = ({ percent, size, stroke, className }: RingProps) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={cn('shrink-0 -rotate-90', className)}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
};

interface TaskScoreBadgeProps {
  status: Task['status'];
  /** `chip` (default) is the small pill on cards; `panel` is the larger readout on the detail sheet. */
  variant?: 'chip' | 'panel';
}

const SCORE_STEPS: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];

export const TaskScoreBadge = ({ status, variant = 'chip' }: TaskScoreBadgeProps) => {
  const percent = taskScorePercent(status);
  const color = scoreColor(status);

  if (variant === 'panel') {
    const stepIndex = SCORE_STEPS.indexOf(status);
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/40 p-3" role="group" aria-label={`Delegation score ${percent} percent`}>
        <div className={cn('relative flex items-center justify-center size-12 shrink-0', color)}>
          <ScoreRing percent={percent} size={48} stroke={5} />
          <span className="absolute text-[13px] font-display font-bold text-text tabular-nums">{percent}%</span>
        </div>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <p className="text-xs font-display font-semibold text-text">Delegation score</p>
          {/* Four steps, filled up to the current one, so the score reads as progress along a path. */}
          <div className="flex gap-1" aria-hidden="true">
            {SCORE_STEPS.map((step, i) => (
              <span key={step} className={cn('h-1.5 flex-1 rounded-full', i <= stepIndex ? 'bg-current' : 'bg-border', i <= stepIndex && color)} />
            ))}
          </div>
          <p className="text-xs font-display text-text-muted">
            {percent === 100 ? 'Finished and approved' : percent === 0 ? 'Not started yet' : `${percent}% so far. The rest comes when it is done and approved.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2.5 rounded-full border border-border/70 bg-surface text-xs font-display font-semibold text-text-secondary"
      title={`Delegation score ${percent}%`}
    >
      <span className={cn('relative flex items-center justify-center size-[18px]', color)}>
        <ScoreRing percent={percent} size={18} stroke={3} />
      </span>
      <span className="tabular-nums text-text">{percent}%</span>
      <span className="text-text-muted font-medium">score</span>
    </span>
  );
};
