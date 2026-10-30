import { useMemo, type ReactNode } from 'react';
import { Flame, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Segmented, Skeleton } from '../../components';
import { PANEL_CLASS } from '../../components/entityCard';
import { formatPct } from '../../lib/percent';
import {
  GOAL_MAX, GOAL_MIN, GOAL_STEP, STREAK_KINDS, STREAK_LABEL, STREAK_TITLE,
  daysFor, summariseStreak, useStreakDays, useStreakGoal, useStreakKind,
} from './useStreak';

const dayLetter = (date: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
const dayNumber = (date: string) => Number(date.slice(8, 10));

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
  const { days: allDays, pending, failed } = useStreakDays();
  const { goal, setGoal } = useStreakGoal();
  const { kind, setKind } = useStreakKind();

  const available = useMemo(
    () => STREAK_KINDS.filter((k) => allDays.some((d) => d.values[k] !== null)),
    [allDays],
  );
  const activeKind = available.includes(kind) ? kind : (available[0] ?? 'checklist');
  const days = useMemo(() => daysFor(allDays, activeKind), [allDays, activeKind]);
  const summary = useMemo(() => summariseStreak(days, goal), [days, goal]);
  const hasData = days.some((d) => d.value !== null);

  if (pending && allDays.length === 0) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (failed || !hasData) return null;

  const hot = summary.current >= 3;
  const met = days.filter((d) => d.value !== null && d.value >= goal).length;
  const counted = days.filter((d) => d.value !== null).length;

  return (
    <section aria-labelledby="streak-heading" className={cn(PANEL_CLASS, '@container flex flex-col p-4 sm:p-5')}>
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:gap-8">
        <div className="flex flex-col gap-3 @3xl:w-80 @3xl:shrink-0">
          <div className="flex items-center gap-3">
            <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl text-white', hot ? 'bg-linear-to-br from-vivid-red to-vivid-sky' : 'bg-vivid-blue')} aria-hidden="true">
              <Flame className="size-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 id="streak-heading" className="t-section font-display font-bold tracking-tight text-text">{STREAK_TITLE[activeKind]}</h2>
              <p className="t-meta font-medium text-text-muted">Days in a row at {goal}% or better</p>
            </div>
          </div>

          {available.length > 1 && (
            <Segmented
              label="Streak type"
              value={activeKind}
              onChange={setKind}
              options={available.map((k) => ({ value: k, label: STREAK_LABEL[k] }))}
              className="self-start"
            />
          )}

          <div className="flex items-end justify-between gap-3">
            <p className="flex items-baseline gap-2">
              <span className={cn('t-figure font-display font-extrabold tabular-nums leading-none', summary.current > 0 ? 'text-vivid-green-text' : 'text-text-muted')}>{summary.current}</span>
              <span className="t-card font-display font-bold text-text">{summary.current === 1 ? 'day' : 'days'}</span>
            </p>
            <dl className="flex flex-col items-end gap-0.5 t-meta font-medium text-text-muted">
              <div className="flex items-baseline gap-1.5">
                <dt>Best in 28 days</dt>
                <dd className="font-display font-bold tabular-nums text-text">{summary.best}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt>Goal met</dt>
                <dd className="font-display font-bold tabular-nums text-text">{met} of {counted}</dd>
              </div>
            </dl>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
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
        </div>

        <div className="min-w-0 flex-1">
          <ol
            className="grid grid-cols-7 gap-1.5 @xl:grid-cols-14 @6xl:grid-cols-28"
            aria-label={`Last ${days.length} days against your ${goal} percent goal`}
          >
            {days.map((d) => {
              const state = d.value === null ? 'none' : d.value >= goal ? 'met' : 'missed';
              return (
                <li
                  key={d.date}
                  title={`${d.label} ${dayNumber(d.date)}: ${d.value === null ? 'nothing due' : formatPct(d.value)}`}
                  aria-label={`${d.label} ${dayNumber(d.date)}: ${d.value === null ? 'nothing due' : `${formatPct(d.value)}, ${state === 'met' ? 'goal met' : 'below the goal'}`}`}
                  className={cn(
                    'flex h-12 flex-col items-center justify-center rounded-lg font-display leading-none',
                    state === 'met' && 'bg-vivid-green text-on-vivid',
                    state === 'missed' && 'bg-vivid-red text-white dark:text-on-vivid',
                    state === 'none' && 'bg-surface-hover text-text-muted',
                  )}
                >
                  <span className="t-meta font-extrabold tabular-nums">{dayNumber(d.date)}</span>
                  <span className="mt-0.5 t-meta font-semibold opacity-80">{dayLetter(d.date)}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 t-meta font-medium text-text-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded bg-vivid-green" />Goal met</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded bg-vivid-red" />Below goal</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded bg-surface-hover" />Nothing due</span>
          </div>
        </div>
      </div>
    </section>
  );
};
