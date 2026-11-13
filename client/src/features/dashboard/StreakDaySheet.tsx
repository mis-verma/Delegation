import { useEffect } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleDashed, Clock3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Modal } from '../../components';
import { formatPct } from '../../lib/percent';
import { STREAK_LABEL, type StreakDay, type StreakKind } from './useStreak';
import { dayFixLink, dayState, moduleDayStats, type DayState } from './streakDay';

interface StreakDaySheetProps {
  days: readonly StreakDay[];
  index: number;
  goal: number;
  kind: StreakKind;
  userId: string;
  today: string;
  canSeeHistory: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const longDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

const STATE_LOOK: Record<DayState, { text: string; icon: typeof Check; chip: string }> = {
  met: { text: 'Goal hit', icon: Check, chip: 'text-success-strong' },
  missed: { text: 'Below goal', icon: X, chip: 'text-vivid-red-text' },
  open: { text: 'In progress', icon: Clock3, chip: 'text-primary-700' },
  none: { text: 'Nothing due', icon: CircleDashed, chip: 'text-coral-600' },
};

export const StreakDaySheet = ({ days, index, goal, kind, userId, today, canSeeHistory, onIndexChange, onClose }: StreakDaySheetProps) => {
  const day = days[index];
  const hasPrev = index > 0;
  const hasNext = index < days.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndexChange]);

  if (!day) return null;

  const isToday = day.date === today;
  const state = dayState(day.value, goal, isToday);
  const look = STATE_LOOK[state];
  const StateIcon = look.icon;
  const stats = moduleDayStats(day.bucket).filter((s) => s.due > 0);
  const fixContext = { userId, day: day.date, today, canSeeHistory };

  return (
    <Modal
      open
      onClose={onClose}
      title={longDay(day.date)}
      description={`${STREAK_LABEL[kind] === 'All' ? 'All your work' : STREAK_LABEL[kind]}${isToday ? ', today so far' : ''}`}
      icon={<CalendarDays size={18} aria-hidden="true" />}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="outline" onClick={() => onIndexChange(index - 1)} disabled={!hasPrev} className="gap-1 max-sm:h-11" aria-label="Previous day">
            <ChevronLeft size={16} aria-hidden="true" />
            Earlier
          </Button>
          <Button variant="outline" onClick={() => onIndexChange(index + 1)} disabled={!hasNext} className="gap-1 max-sm:h-11" aria-label="Next day">
            Later
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      }
    >
      <div key={day.date} className="flex flex-col gap-4 animate-in fade-in duration-200 motion-reduce:animate-none">
        <div className="stat-navy flex items-center justify-between gap-3 rounded-2xl p-4 [--stat-accent:var(--stat-accent-due)]">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="t-meta font-display font-semibold text-white/75">Day score</span>
            <span className="t-figure font-figure font-extrabold leading-none tabular-nums text-white">
              {day.value === null ? '-' : formatPct(day.value)}
            </span>
            <span className="t-meta text-white/70">Your goal is {goal}%</span>
          </div>
          <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 t-meta font-display font-bold', look.chip)}>
            <StateIcon size={13} strokeWidth={2.5} aria-hidden="true" />
            {look.text}
          </span>
        </div>

        {day.value !== null && (
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-hover" role="img" aria-label={`Score ${formatPct(day.value)} against a goal of ${goal}%`}>
            <span
              className={cn('block h-full rounded-full transition-[width] duration-300 ease-out', state === 'met' || state === 'open' ? 'bg-primary-600' : 'bg-danger')}
              style={{ width: `${Math.min(100, day.value)}%` }}
            />
            <span className="absolute inset-y-0 w-0.5 bg-text" style={{ left: `${goal}%` }} aria-hidden="true" />
          </div>
        )}

        {stats.length === 0 ? (
          <p className="rounded-xl bg-surface-hover/50 px-4 py-6 text-center t-card font-medium text-text-muted">
            Nothing was due on this day, so it doesn&apos;t count for or against your streak.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="By type of work">
            {stats.map((s) => {
              const fix = dayFixLink(s, fixContext);
              const active = kind === s.module;
              return (
                <li
                  key={s.module}
                  className={cn('flex flex-col gap-2 rounded-xl border p-3', active ? 'border-primary-500/40 bg-primary-500/5 dark:bg-primary-500/10' : 'border-border/60')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="t-card font-display font-semibold text-text">{STREAK_LABEL[s.module]}</span>
                    <span className="t-card font-display font-bold tabular-nums text-text">{s.pct === null ? '-' : formatPct(s.pct)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                    <span className="block h-full rounded-full bg-primary-600 transition-[width] duration-300 ease-out" style={{ width: `${s.pct ?? 0}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="t-meta font-medium text-text-secondary tabular-nums">
                      {s.done} of {s.due} done
                      {s.late > 0 && <span className="text-danger">, {s.late} late</span>}
                    </span>
                    {fix && (
                      <Link
                        to={fix.href}
                        viewTransition
                        onClick={onClose}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 t-meta font-display font-semibold text-primary-700 outline-none transition-colors duration-150 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-8 dark:text-primary-300"
                      >
                        {fix.label}
                        <ChevronRight size={13} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {stats.length > 0 && (
          <p className="t-meta text-text-muted">
            Scores come from the work itself. Finish or fix the items above and this day updates on its own.
          </p>
        )}
      </div>
    </Modal>
  );
};
