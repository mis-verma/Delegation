import { useMemo, type ReactNode } from 'react';
import { Check, Flame, Minus, Plus, Target, Trophy, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError, Segmented, Skeleton } from '../../components';
import { PANEL_CLASS } from '../../components/entityCard';
import { DashCardHeader } from './DashCardHeader';
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
    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-hover/70 text-text-secondary ring-1 ring-inset ring-border/60 outline-none transition-colors duration-150 ease-out cursor-pointer hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-40 pointer-fine:size-9"
  >
    {children}
  </button>
);

const SHOWN_DAYS = 14;

const Figure = ({ icon: Icon, tone, tint, value, unit, label }: { icon: LucideIcon; tone: string; tint: string; value: ReactNode; unit: string; label: string }) => (
  <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-xl p-3 ring-1 ring-inset ring-border/40', tint)}>
    <span className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone)} aria-hidden="true">
        <Icon size={12} strokeWidth={2.5} />
      </span>
      <span className="truncate">{label}</span>
    </span>
    <span className="flex items-baseline gap-1">
      <span className="t-stat font-figure font-extrabold leading-none tabular-nums text-text">{value}</span>
      <span className="t-meta font-medium text-text-muted">{unit}</span>
    </span>
  </div>
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

  const header = <DashCardHeader id="streak-heading" title={STREAK_TITLE[activeKind]} />;
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
  const recent = days.slice(-SHOWN_DAYS);
  const lastDate = recent[recent.length - 1]?.date;

  return shell(
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {available.length > 1 && (
        <Segmented
          label="Streak type"
          value={activeKind}
          onChange={setKind}
          options={available.map((k) => ({ value: k, label: STREAK_LABEL[k] }))}
          className="self-start"
        />
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Figure
          icon={Flame}
          tone={summary.current > 0 ? 'bg-linear-to-br from-(--streak-fire-from) to-(--streak-fire-to)' : 'bg-text-muted'}
          tint={summary.current > 0 ? 'bg-(--streak-fire-tint)' : 'bg-surface-hover/50'}
          value={<span className={cn(hot && 'live-dot')}>{summary.current}</span>}
          unit={summary.current === 1 ? 'day' : 'days'}
          label="Current streak"
        />
        <Figure icon={Trophy} tone="bg-(--streak-gold)" tint="bg-(--streak-gold-tint)" value={summary.best} unit={summary.best === 1 ? 'day' : 'days'} label="Best run" />
        <Figure icon={Target} tone="bg-linear-to-br from-(--streak-hit-from) to-(--streak-hit-to)" tint="bg-(--streak-hit-tint)" value={met} unit={`of ${counted}`} label="Goal hit" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
        <span className="flex flex-col">
          <span className="t-card font-display font-semibold text-text">Daily goal</span>
          <span className="t-meta text-text-muted">Score {goal}% or more to keep the streak going.</span>
        </span>
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

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">Last {recent.length} days</span>
          <span className="flex items-center gap-3 t-meta text-text-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><span className="flex size-3.5 items-center justify-center rounded bg-linear-to-br from-(--streak-hit-from) to-(--streak-hit-to) text-white"><Check size={9} strokeWidth={3.5} /></span>Hit</span>
            <span className="inline-flex items-center gap-1"><span className="flex size-3.5 items-center justify-center rounded bg-(--heat-low) text-(--heat-low-ink)"><X size={9} strokeWidth={3.5} /></span>Missed</span>
            <span className="inline-flex items-center gap-1"><span className="size-3.5 rounded bg-surface-hover" />Nothing due</span>
          </span>
        </div>
        <ol className="grid grid-cols-7 gap-1.5 sm:grid-cols-14" aria-label={`Last ${recent.length} days against your ${goal} percent goal`}>
          {recent.map((d) => {
            const state = d.value === null ? 'none' : d.value >= goal ? 'met' : 'missed';
            const isToday = d.date === lastDate;
            return (
              <li
                key={d.date}
                title={`${d.label} ${dayNumber(d.date)}: ${d.value === null ? 'nothing due' : formatPct(d.value)}`}
                aria-label={`${d.label} ${dayNumber(d.date)}: ${d.value === null ? 'nothing due' : `${formatPct(d.value)}, ${state === 'met' ? 'goal hit' : 'goal missed'}`}`}
                className="flex flex-col items-center gap-1"
              >
                <span className={cn('t-meta font-display font-semibold leading-none', isToday ? 'text-text' : 'text-text-muted')}>{dayLetter(d.date)}</span>
                <span
                  className={cn(
                    'flex aspect-square w-full max-w-11 items-center justify-center rounded-lg',
                    state === 'met' && 'bg-linear-to-br from-(--streak-hit-from) to-(--streak-hit-to) text-white',
                    state === 'missed' && 'bg-(--heat-low) text-(--heat-low-ink)',
                    state === 'none' && 'bg-surface-hover/70 text-text-light',
                    isToday && 'ring-2 ring-primary-500/60 ring-offset-1 ring-offset-surface',
                  )}
                >
                  {state === 'met' ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : state === 'missed' ? <X size={14} strokeWidth={3} aria-hidden="true" /> : null}
                </span>
                <span className="t-meta tabular-nums leading-none text-text-muted">{dayNumber(d.date)}</span>
              </li>
            );
          })}
        </ol>
        <p className="t-meta text-text-muted">Days with nothing due don't break the streak. Best run and Goal hit count the last {days.length} days.</p>
      </div>
    </div>,
  );
};
