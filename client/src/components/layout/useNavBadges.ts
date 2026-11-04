import { useTaskSummaryQuery } from '../../features/tasks/hook';
import { useTicketSummaryQuery } from '../../features/tickets/hook';
import { useTodoSummaryQuery } from '../../features/todo/hook';
import { useChecklistInstanceSummaryQuery } from '../../features/checklist/hook';
import { useOrgToday } from '../../features/checklist/useOrgToday';

export interface NavBadge {
  due: number;
  overdue: number;
}

export type NavBadgeMap = Record<'/tickets' | '/tasks' | '/todo' | '/checklists', NavBadge>;

const EMPTY: NavBadge = { due: 0, overdue: 0 };

export const badgeSummary = ({ due, overdue }: NavBadge) => {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (due > 0) parts.push(`${due} not yet due`);
  return parts.join(', ');
};

const OPEN_LOOKBACK_DAYS = 45;

const shiftDay = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const useTodayChecklistSummary = () => {
  const today = useOrgToday();
  const todayRuns = useChecklistInstanceSummaryQuery({ mine: true, from: today, to: today });
  const open = useChecklistInstanceSummaryQuery({ mine: true, from: shiftDay(today, -OPEN_LOOKBACK_DAYS), to: today });
  const summary = todayRuns.data && open.data
    ? {
        total: todayRuns.data.total,
        newToday: todayRuns.data.newToday,
        completed: todayRuns.data.completed,
        due: open.data.due,
        overdue: todayRuns.data.overdue,
      }
    : undefined;
  return { data: summary, isError: todayRuns.isError || open.isError };
};

type CountQuery = { data?: { due: number; overdue: number }; isError: boolean };

export const settledCounts = <T>(query: { data?: T; isError: boolean }): T | undefined => (query.isError ? undefined : query.data);

const pick = (query: CountQuery): NavBadge => {
  const s = settledCounts(query);
  return s ? { due: s.due, overdue: s.overdue } : EMPTY;
};

export const useNavBadges = (): NavBadgeMap => {
  const tasks = useTaskSummaryQuery();
  const tickets = useTicketSummaryQuery();
  const todos = useTodoSummaryQuery();
  const checklists = useTodayChecklistSummary();

  return {
    '/tickets': pick(tickets),
    '/tasks': pick(tasks),
    '/todo': pick(todos),
    '/checklists': pick(checklists),
  };
};
