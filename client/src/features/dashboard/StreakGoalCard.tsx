import { useMemo, useState, type ReactNode } from 'react';
import { Check, Flame, Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError, Skeleton, SlidingTabs } from '../../components';
import { PANEL_CLASS } from '../../components/entityCard';
import { useAuth } from '../../context/AuthContext';
import { formatPct } from '../../lib/percent';
import { useOrgToday } from '../checklist/useOrgToday';
import { DashCardHeader } from './DashCardHeader';
import { StreakDaySheet } from './StreakDaySheet';
import { dayState, type DayState } from './streakDay';
import {
  GOAL_MAX, GOAL_MIN, GOAL_STEP, STREAK_KINDS, STREAK_LABEL, STREAK_TITLE,
  daysFor, summariseStreak, useStreakDays, useStreakGoal, useStreakKind,
} from './useStreak';

const HISTORY_ROLES = new Set(['ADMIN', 'PC', 'MANAGER', 'SENIOR', 'OWNER']);

const dayLetter = (date: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
const dayNumber = (date: string) => Number(date.slice(8, 10));

const CELL_LOOK: Record<DayState, string> = {
  met: 'stat-navy text-white [--stat-accent:var(--stat-accent-completed)]',
  missed: 'bg-danger/10 text-danger ring-1 ring-inset ring-danger/25',
  none: 'bg-surface-hover/60 text-text-light',
};

const STATE_WORD: Record<DayState, string> = { met: 'goal hit', missed: 'below goal', none: 'nothing due' };

const StepButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary outline-none transition-colors duration-150 ease-out cursor-pointer hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-40 pointer-fine:size-8"
  >
    {children}
  </button>
);

const LegendSwatch = ({ className, children, label }: { className: string; children?: ReactNode; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cn('flex size-4 items-center justify-center rounded-md', className)} aria-hidden="true">{children}</span>
    {label}
  </span>
);

const StreakSkeleton = () => (
  <div className="flex flex-col gap-4 p-4 sm:p-5" role="status" aria-label="Loading your streak">
    <div className="flex items-center gap-3">
      <Skeleton className="size-14 shrink-0 rounded-2xl" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-44" />
      </div>
    </div>
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {Array.from({ length: 28 }, (_, i) => <Skeleton key={i} className="aspect-square w-full rounded-xl" />)}
    </div>
  </div>
);

export const StreakGoalCard = () => {
  const { user } = useAuth();
  const today = useOrgToday();
  const { days: allDays, pending, failed, retry } = useStreakDays();
  const { goal, setGoal } = useStreakGoal();
  const { kind, setKind } = useStreakKind();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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

  const current = summary.current;
  const hot = current >= 3;
  const met = days.filter((d) => d.value !== null && d.value >= goal).length;
  const counted = days.filter((d) => d.value !== null).length;
  const weekdays = days.slice(0, 7).map((d) => dayLetter(d.date));

  return shell(
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {available.length > 1 && (
        <SlidingTabs
          label="Streak type"
          value={activeKind}
          onChange={setKind}
          options={available.map((k) => ({ value: k, label: STREAK_LABEL[k] }))}
          size="sm"
          fill="phone"
          className="max-sm:w-full sm:self-start"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex size-14 shrink-0 items-center justify-center rounded-2xl',
              current > 0 ? 'stat-navy text-white [--stat-accent:var(--stat-accent-due)]' : 'bg-surface-hover text-text-light',
            )}
            aria-hidden="true"
          >
            <Flame size={26} strokeWidth={2} className={cn(hot && 'live-dot')} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-baseline gap-1.5">
              <span className="t-figure font-figure font-extrabold leading-none tabular-nums text-text">{current}</span>
              <span className="t-card font-display font-semibold text-text-secondary">{current === 1 ? 'day' : 'days'} in a row</span>
            </span>
            <span className="t-meta font-medium text-text-muted">
              {current > 0 ? `Best ${summary.best} · Goal hit ${met} of ${counted} days` : 'Hit your goal on your next working day to start one.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-border/60 p-0.5" role="group" aria-label="Daily goal">
          <StepButton label={`Lower the goal to ${goal - GOAL_STEP} percent`} onClick={() => setGoal(goal - GOAL_STEP)} disabled={goal <= GOAL_MIN}>
            <Minus size={14} aria-hidden="true" />
          </StepButton>
          <span className="flex min-w-14 flex-col items-center leading-none" aria-live="polite">
            <span className="t-card font-display font-bold tabular-nums text-text">{goal}%</span>
            <span className="t-meta text-text-muted">goal</span>
          </span>
          <StepButton label={`Raise the goal to ${goal + GOAL_STEP} percent`} onClick={() => setGoal(goal + GOAL_STEP)} disabled={goal >= GOAL_MAX}>
            <Plus size={14} aria-hidden="true" />
          </StepButton>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="t-meta font-display font-semibold text-text-secondary">Last {days.length} days</h3>
          <span className="t-meta text-text-muted">Tap a day for details</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-hidden="true">
          {weekdays.map((w, i) => <span key={i} className="text-center t-meta font-display font-semibold text-text-light">{w}</span>)}
        </div>

        <ol className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label={`Last ${days.length} days against your ${goal} percent goal`}>
          {days.map((d, i) => {
            const state = dayState(d.value, goal);
            const isToday = d.date === today;
            return (
              <li key={d.date} className="flex">
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  aria-haspopup="dialog"
                  aria-label={`${d.label} ${dayNumber(d.date)}${isToday ? ', today' : ''}: ${d.value === null ? 'nothing due' : `${formatPct(d.value)}, ${STATE_WORD[state]}`}. Open details`}
                  title={d.value === null ? 'Nothing due' : formatPct(d.value)}
                  className={cn(
                    'flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl t-meta font-display font-bold tabular-nums leading-none',
                    'transition-[transform,box-shadow,filter] duration-150 ease-out hover:brightness-105 hover:ring-2 hover:ring-primary-500/40 active:scale-95',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60',
                    CELL_LOOK[state],
                    isToday && 'outline-2 outline-offset-2 outline-primary-500',
                    openIndex === i && 'ring-2 ring-primary-500/70',
                  )}
                >
                  <span>{dayNumber(d.date)}</span>
                  {state === 'met' && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                  {state === 'missed' && <X size={11} strokeWidth={3} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 t-meta font-medium text-text-muted">
          <LegendSwatch className="stat-navy text-white [--stat-accent:var(--stat-accent-completed)]" label="Goal hit">
            <Check size={10} strokeWidth={3} />
          </LegendSwatch>
          <LegendSwatch className="bg-danger/10 text-danger ring-1 ring-inset ring-danger/25" label="Below goal">
            <X size={10} strokeWidth={3} />
          </LegendSwatch>
          <LegendSwatch className="bg-surface-hover/60" label="Nothing due" />
          <LegendSwatch className="outline-2 outline-offset-1 outline-primary-500" label="Today" />
        </div>
        <p className="t-meta text-text-muted">Days with nothing due don&apos;t break the streak.</p>
      </div>

      {openIndex !== null && user && (
        <StreakDaySheet
          days={days}
          index={openIndex}
          goal={goal}
          kind={activeKind}
          userId={user.id}
          today={today}
          canSeeHistory={HISTORY_ROLES.has(user.role)}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>,
  );
};
