import { useCallback, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { scoreApi, type ScoreTrend } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { shiftDay } from '../admin/analytics/analyticsDisplay';
import { useOrgToday } from '../checklist/useOrgToday';
import { SCORE_QUERY_OPTIONS } from './scoreQueries';

const WEEKS = 4;
const WEEK_DAYS = 7;

export const GOAL_MIN = 50;
export const GOAL_MAX = 100;
export const GOAL_STEP = 5;
const GOAL_DEFAULT = 90;

export interface StreakDay {
  date: string;
  label: string;
  value: number | null;
}

const readGoal = (key: string): number => {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n >= GOAL_MIN && n <= GOAL_MAX ? n : GOAL_DEFAULT;
  } catch {
    return GOAL_DEFAULT;
  }
};

export const useStreakGoal = () => {
  const { user } = useAuth();
  const key = `tm-streak-goal-${user?.id ?? 'anon'}`;
  const [goal, setGoalState] = useState(() => readGoal(key));
  const setGoal = useCallback((next: number) => {
    const clamped = Math.min(GOAL_MAX, Math.max(GOAL_MIN, next));
    setGoalState(clamped);
    try {
      localStorage.setItem(key, String(clamped));
    } catch {
      return;
    }
  }, [key]);
  return { goal, setGoal };
};

export interface StreakSummary {
  current: number;
  best: number;
}

export const summariseStreak = (days: readonly StreakDay[], goal: number): StreakSummary => {
  let best = 0;
  let run = 0;
  for (const day of days) {
    if (day.value === null) continue;
    if (day.value >= goal) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const value = days[i]?.value ?? null;
    if (value === null) continue;
    if (value >= goal) current += 1;
    else if (i === days.length - 1) continue;
    else break;
  }
  return { current, best };
};

export const useStreakDays = () => {
  const { token } = useAuth();
  const today = useOrgToday();
  const ends = useMemo(() => Array.from({ length: WEEKS }, (_, i) => shiftDay(today, -(WEEKS - 1 - i) * WEEK_DAYS)), [today]);

  const results = useQueries({
    queries: ends.map((to) => {
      const from = shiftDay(to, -(WEEK_DAYS - 1));
      return {
        queryKey: ['scores', 'trend', 'person', 'me', 'day', from, to] as const,
        queryFn: (): Promise<ScoreTrend> => scoreApi.trend({ scope: 'person', period: 'day', from, to }),
        enabled: !!token,
        ...SCORE_QUERY_OPTIONS,
      };
    }),
  });

  const pending = results.some((r) => r.isPending);
  const failed = results.some((r) => r.isError) && !results.some((r) => r.data);
  const days = useMemo<StreakDay[]>(
    () => results.flatMap((r) => (r.data?.buckets ?? []).map((b) => ({
      date: b.from,
      label: b.label,
      value: b.checklist.due > 0 ? b.checklist.completionPct : null,
    }))),
    [results],
  );

  return { days, pending, failed };
};
