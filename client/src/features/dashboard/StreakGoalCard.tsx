import { useMemo, type ReactNode } from 'react';
import { Flame, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError, Segmented, Skeleton } from '../../components';
import { PANEL_CLASS } from '../../components/entityCard';
import { DashCardHeader } from './DashCardHeader';
import { CATEGORY_PILL } from './categoryLook';
import { formatPct } from '../../lib/percent';
import {
  GOAL_MAX, GOAL_MIN, GOAL_STEP, STREAK_KINDS, type StreakKind, STREAK_LABEL, STREAK_TITLE,
  daysFor, summariseStreak, useStreakDays, useStreakGoal, useStreakKind,
} from './useStreak';

const KIND_PILL: Record<StreakKind, string> = {
  checklist: CATEGORY_PILL.checklist,
  ticket: CATEGORY_PILL.ticket,
  delegation: CATEGORY_PILL.delegation,
  all: 'bg-surface-hover text-text-secondary',
};

const dayLetter = (date: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
const dayNumber = (date: string) => Number(date.slice(8, 10));

const StepButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary outline-none transition-colors duration-150 ease-out cursor-pointer hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-40 pointer-fine:size-9"
  >
    {children}
  </button>
);

const StreakSkeleton = () => (
  <div className="flex flex-col gap-3 p-4 sm:p-5" role="status" aria-label="Loading your streak">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-4 w-24" />
    </div>
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
    </div>
  </div>
);

export const StreakGoalCard = () => {
  const { days: allDays, pending, failed, retry } = useStreakDays();
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

  const header = <DashCardHeader id="streak-heading" title={STREAK_TITLE[activeKind]} subtitle={`Days in a row at ${goal}% or better`} />;
  const shell = (body: ReactNode) => (
    <section aria-labelledby="streak-heading" className={cn(PANEL_CLASS, 'flex h-full flex-col overflow-hidden')}>
      {header}
      {body}
    </section>
  );

  if (pending && allDays.length === 0) return shell(<StreakSkeleton />);
  if (failed) {
    return shell(
      <div className="p-4 sm:p-5">
        <InlineError message="Couldn't load your streak." onRetry={retry} />
      </div>,
    );
  }
  if (!hasData) {
    return shell(<p className="px-4 py-6 text-center t-card font-medium text-text-muted sm:px-5">Your streak starts once work comes due.</p>);
  }

  const hot = summary.current >= 3;
  const met = days.filter((d) => d.value !== null && d.value >= goal).length;
  const counted = days.filter((d) => d.value !== null).length;

  return shell(
    <div className="@container flex flex-col p-4 sm:p-5">
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:gap-8">
        <div className="flex flex-col gap-3 @3xl:w-80 @3xl:shrink-0">
          {available.length > 1 && (
            <Segmented
              label="Streak type"
              value={activeKind}
              onChange={setKind}
              options={available.map((k) => ({ value: k, label: STREAK_LABEL[k] }))}
              className="self-start"
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2">
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', KIND_PILL[activeKind])} aria-hidden="true">
                <Flame className={cn('size-4', hot && 'live-dot')} strokeWidth={2.25} />
              </span>
              <span className={cn('t-stat font-display font-bold tabular-nums leading-none', summary.current > 0 ? 'text-text' : 'text-text-muted')}>{summary.current}</span>
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

          <div className="hidden items-center justify-between gap-3 border-t border-border/60 pt-3 sm:flex">
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

        <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                  style={state === 'met' ? { background: 'var(--heat-high)', color: 'var(--heat-high-ink)' } : state === 'missed' ? { background: 'var(--heat-low)', color: 'var(--heat-low-ink)', boxShadow: 'inset 0 -3px 0 var(--color-vivid-red)' } : undefined}
                  className={cn(
                    'flex h-12 flex-col items-center justify-center gap-0.5 rounded-md font-display leading-none',
                    state === 'none' && 'bg-surface-hover text-text-muted',
                  )}
                >
                  <span className="t-meta font-extrabold tabular-nums">{dayNumber(d.date)}</span>
                  <span className="t-meta font-semibold opacity-80">{dayLetter(d.date)}</span>
                </li>
              );
            })}
          </ol>
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 t-meta font-medium text-text-muted sm:flex" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-sm" style={{ background: 'var(--heat-high)' }} />Goal met</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-sm" style={{ background: 'var(--heat-low)' }} />Below goal</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded bg-surface-hover" />Nothing due</span>
          </div>
        </div>
      </div>
    </div>,
  );
};
