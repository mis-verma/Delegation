import { useMemo } from 'react';
import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';

export interface CalendarStatValues {
  inMonth: number;
  overdueInMonth: number;
  dueToday: number;
  dueThisWeek: number;
}

type StatKey = keyof CalendarStatValues;

interface CalendarStatsProps {
  stats: CalendarStatValues;
  isPending: boolean;
  isError?: boolean;
  monthLabel: string;
  todayWeekday: string;
}

export const CalendarStats = ({ stats, isPending, isError = false, monthLabel, todayWeekday }: CalendarStatsProps) => {
  const items = useMemo<StatusFigureItem<StatKey>[]>(() => [
    { key: 'inMonth', kind: 'total', label: 'This month', short: 'Month', help: `Everything dated in ${monthLabel}`, note: monthLabel },
    { key: 'overdueInMonth', kind: 'late', label: 'Overdue', short: 'Overdue', help: 'Past its date and still open, this month', note: 'This month' },
    { key: 'dueToday', kind: 'due', label: 'Due today', short: 'Today', help: 'Everything dated today', note: todayWeekday },
    { key: 'dueThisWeek', kind: 'pending', label: 'Due this week', short: 'Week', help: 'Everything dated Sunday to Saturday this week', note: 'Sun to Sat' },
  ], [monthLabel, todayWeekday]);

  return <StatusFigureStats label="Calendar summary" items={items} counts={stats} isLoading={isPending} error={isError} />;
};
