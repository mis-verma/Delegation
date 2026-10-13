import { useTaskSummaryQuery } from '../../features/tasks/hook';
import { useTicketSummaryQuery } from '../../features/tickets/hook';
import { useTodoSummaryQuery } from '../../features/todo/hook';
import { useChecklistInstanceSummaryQuery } from '../../features/checklist/hook';
import { useOrgToday } from '../../features/checklist/useOrgToday';

export interface NavBadge {
  /** Open and waiting for the person. */
  due: number;
  /** Past its deadline. These are the ones painted red. */
  overdue: number;
}

export type NavBadgeMap = Record<'/tickets' | '/tasks' | '/todo' | '/checklists', NavBadge>;

const EMPTY: NavBadge = { due: 0, overdue: 0 };

/** The words a screen reader gets for a section's counts. */
export const badgeSummary = ({ due, overdue }: NavBadge) => {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (due > 0) parts.push(`${due} pending`);
  return parts.join(', ');
};

// How far back an open run can still have been started: a weekly or monthly checklist begun earlier is
// still the person's to fill. The same reach the server used for "mine" before the summary got a window.
const OPEN_LOOKBACK_DAYS = 45;

const shiftDay = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * My checklist counts for the sidebar and the bottom bar: only what can still be acted on now.
 * The summary endpoint defaults to month to date, so reading it as is would keep counting runs missed on
 * earlier days that nobody can fix any more. Two windows instead, each read from its own field:
 *  - `due` (on track: not done, cutoff not reached) from a look-back window, so a weekly or monthly run
 *    begun earlier still counts while it is open;
 *  - `overdue` (missed: past the cutoff, not done) from today alone, so only today's misses show.
 * The sidebar and the bottom bar both read this, so they share one cache entry per window.
 */
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

/**
 * Pending and overdue counts for each main section, for the phone bottom bar and the notification
 * panel. These are the same four summary queries the sidebar badges read, so they share one cache entry
 * each and cost no extra requests.
 */
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
