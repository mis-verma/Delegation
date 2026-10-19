import { TASK_SCORE, taskScorePercent } from './taskDisplay';
import { cn } from '@/lib/utils';
import type { Task } from '../../api/task';

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
}

export const TaskScoreBadge = ({ status }: TaskScoreBadgeProps) => {
  const percent = taskScorePercent(status);
  const color = scoreColor(status);

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
