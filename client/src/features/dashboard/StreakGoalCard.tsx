import { useMemo, type ReactNode } from 'react';
import { Flame, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components';
import { PANEL_CLASS } from '../../components/entityCard';
import { formatPct } from '../../lib/percent';
import { GOAL_MAX, GOAL_MIN, GOAL_STEP, summariseStreak, useStreakDays, useStreakGoal } from './useStreak';

const STRIP_DAYS = 14;

const dayLetter = (date: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';

const StepButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary outline-none transition-colors duration-150 cursor-pointer hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-11"
  >
    {children}
  </button>
);

export const StreakGoalCard = () => {
  const { days, pending, failed } = useStreakDays();
  const { goal, setGoal } = useStreakGoal();
  const summary = useMemo(() => summariseStreak(days, goal), [days, goal]);
  const strip = days.slice(-STRIP_DAYS);
  const hasData = days.some((d) => d.value !== null);

  if (pending && days.length === 0) return <Skeleton className="h-44 w-full rounded-2xl" />;
  if (failed || !hasData) return null;

  const hot = summary.current >= 3;

  return (
    <section aria-labelledby="streak-heading" className={cn(PANEL_CLASS, 'flex h-full flex-col gap-3 p-4 sm:p-5')}>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white', hot ? 'bg-linear-to-br from-vivid-red to-vivid-sky' : 'bg-vivid-blue')} aria-hidden="true">
          <Flame className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2 id="streak-heading" className="t-section font-display font-bold tracking-tight text-text">Checklist streak</h2>
          <p className="t-meta font-medium text-text-muted">Days in a row at {goal}% or better</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className={cn('t-figure font-display font-extrabold tabular-nums leading-none', summary.current > 0 ? 'text-vivid-green-text' : 'text-text-muted')}>{summary.current}</span>
          <span className="t-card font-display font-bold text-text">{summary.current === 1 ? 'day' : 'days'}</span>
        </p>
        <p className="t-meta font-medium text-text-muted">Best in 28 days: <span className="font-display font-bold tabular-nums text-text">{summary.best}</span></p>
      </div>

      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={`Last ${strip.length} days: ${strip.map((d) => `${d.label} ${d.value === null ? 'nothing due' : formatPct(d.value)}`).join(', ')}`}
      >
        {strip.map((d) => (
          <span
            key={d.date}
            title={`${d.label}: ${d.value === null ? 'nothing due' : formatPct(d.value)}`}
            className={cn(
              'flex h-6 min-w-4 flex-1 items-center justify-center rounded-md t-meta font-display font-bold leading-none',
              d.value === null ? 'bg-surface-hover text-text-muted' : d.value >= goal ? 'bg-vivid-green text-white' : 'bg-vivid-red text-white',
            )}
          >
            <span aria-hidden="true" className="max-sm:hidden">{dayLetter(d.date)}</span>
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="t-meta font-display font-semibold text-text-secondary">Your goal</span>
        <div className="flex items-center gap-2">
          <StepButton label={`Lower the goal to ${goal - GOAL_STEP} percent`} onClick={() => setGoal(goal - GOAL_STEP)} disabled={goal <= GOAL_MIN}>
            <Minus size={14} aria-hidden="true" />
          </StepButton>
          <span className="min-w-12 text-center t-card font-display font-extrabold tabular-nums text-text" aria-live="polite">{goal}%</span>
          <StepButton label={`Raise the goal to ${goal + GOAL_STEP} percent`} onClick={() => setGoal(goal + GOAL_STEP)} disabled={goal >= GOAL_MAX}>
            <Plus size={14} aria-hidden="true" />
          </StepButton>
        </div>
      </div>
    </section>
  );
};
