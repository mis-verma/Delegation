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
  if (due > 0) parts.push(`${due} pending`);
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
  return { data: summary };
};

export const useNavBadges = (): NavBadgeMap => {
  const { data: tasks } = useTaskSummaryQuery();
  const { data: tickets } = useTicketSummaryQuery();
  const { data: todos } = useTodoSummaryQuery();
  const { data: checklists } = useTodayChecklistSummary();

  const pick = (s: { due: number; overdue: number } | undefined): NavBadge => (s ? { due: s.due, overdue: s.overdue } : EMPTY);
  return {
    '/tickets': pick(tickets),
    '/tasks': pick(tasks),
    '/todo': pick(todos),
    '/checklists': pick(checklists),
  };
};
