import { useTaskSummaryQuery } from '../../features/tasks/hook';
import { useTicketSummaryQuery } from '../../features/tickets/hook';
import { useTodoSummaryQuery } from '../../features/todo/hook';
import { useChecklistInstanceSummaryQuery } from '../../features/checklist/hook';

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

/**
 * Pending and overdue counts for each main section, for the phone bottom bar and the notification
 * panel. These are the same four summary queries the sidebar badges read, so they share one cache entry
 * each and cost no extra requests.
 */
export const useNavBadges = (): NavBadgeMap => {
  const { data: tasks } = useTaskSummaryQuery();
  const { data: tickets } = useTicketSummaryQuery();
  const { data: todos } = useTodoSummaryQuery();
  const { data: checklists } = useChecklistInstanceSummaryQuery({ mine: true });

  const pick = (s: { due: number; overdue: number } | undefined): NavBadge => (s ? { due: s.due, overdue: s.overdue } : EMPTY);
  return {
    '/tickets': pick(tickets),
    '/tasks': pick(tasks),
    '/todo': pick(todos),
    '/checklists': pick(checklists),
  };
};
