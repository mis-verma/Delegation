import { memo } from 'react';
import { InlineError } from '../../components/inlineError';
import { useActionPoints } from '../attention/useAttention';
import { useApprovalSources } from './useApprovalSources';
import { FigureCard, type FigureTone } from './FigureCard';

const NO_POINTS = { openTickets: 0, overdueTickets: 0, openDelegations: 0, overdueDelegations: 0, sentBackRuns: 0 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const shareOnTime = (open: number, overdue: number) => (open <= 0 ? 100 : Math.max(0, ((open - overdue) / open) * 100));
const lateTone = (overdue: number): FigureTone => (overdue > 0 ? 'bad' : 'good');

export const ActionPointsStrip = memo(() => {
  const { queueHref, tasks, tickets, checklists } = useApprovalSources();
  const points = useActionPoints();

  if (points.isError && !points.data) {
    return (
      <div className="px-4 py-3 sm:px-5 border-b border-border/40">
        <InlineError message="Couldn't load the action points." onRetry={() => void points.refetch()} />
      </div>
    );
  }

  const pointsLoading = points.isPending;
  const totals = points.data ?? NO_POINTS;
  const delegationApprovals = tasks.data?.total ?? 0;
  const ticketApprovals = tickets.data?.total ?? 0;
  const checklistApprovals = checklists.data?.total ?? 0;
  const toQueue = queueHref ?? undefined;
  const approvalTone = (n: number): FigureTone => (n === 0 ? 'good' : 'plain');

  return (
    <div className="@container border-b border-border/40 px-4 py-3 sm:px-5" role="group" aria-label="Action points">
      <div className="grid grid-cols-3 gap-2">
        <FigureCard
          label="Ticket approvals"
          short="Tickets"
          help={ticketApprovals === 0 ? 'No tickets are waiting for sign-off.' : 'Tickets waiting for sign-off. Tap to open the queue.'}
          value={ticketApprovals}
          tone={approvalTone(ticketApprovals)}
          bar={ticketApprovals === 0 ? 100 : null}
          loading={tickets.isPending}
          compact
          to={toQueue}
        />
        <FigureCard
          label="Delegation approvals"
          short="Deleg."
          help={delegationApprovals === 0 ? 'No delegations are waiting for sign-off.' : 'Delegations waiting for sign-off. Tap to open the queue.'}
          value={delegationApprovals}
          tone={approvalTone(delegationApprovals)}
          bar={delegationApprovals === 0 ? 100 : null}
          loading={tasks.isPending}
          compact
          to={toQueue}
        />
        <FigureCard
          label="Checklist approvals"
          short="Lists"
          help={checklistApprovals === 0 ? 'No checklist runs are waiting for review.' : 'Checklist runs waiting for review. Tap to open the queue.'}
          value={checklistApprovals}
          tone={approvalTone(checklistApprovals)}
          bar={checklistApprovals === 0 ? 100 : null}
          loading={checklists.isPending}
          compact
          to={toQueue}
        />
        <FigureCard
          label="Open tickets"
          short="Open tkts"
          help={totals.overdueTickets === 0 ? 'Tickets open right now. None are overdue. Tap to open the tickets.' : `Tickets open right now. ${totals.overdueTickets} overdue. Tap to open the tickets.`}
          value={totals.openTickets}
          tone={lateTone(totals.overdueTickets)}
          bar={shareOnTime(totals.openTickets, totals.overdueTickets)}
          loading={pointsLoading}
          compact
          to="/tickets"
        />
        <FigureCard
          label="Open delegations"
          short="Open deleg."
          help={totals.overdueDelegations === 0 ? 'Delegations open right now. None are overdue. Tap to open the delegations.' : `Delegations open right now. ${totals.overdueDelegations} overdue. Tap to open the delegations.`}
          value={totals.openDelegations}
          tone={lateTone(totals.overdueDelegations)}
          bar={shareOnTime(totals.openDelegations, totals.overdueDelegations)}
          loading={pointsLoading}
          compact
          to="/tasks"
        />
        <FigureCard
          label="Checklists sent back"
          short="Sent back"
          help={totals.sentBackRuns === 0 ? 'No checklist runs to redo today.' : `${plural(totals.sentBackRuns, 'run', 'runs')} to redo today. Tap to open the checklists.`}
          value={totals.sentBackRuns}
          tone={totals.sentBackRuns > 0 ? 'bad' : 'good'}
          bar={totals.sentBackRuns === 0 ? 100 : null}
          loading={pointsLoading}
          compact
          to="/checklists"
        />
      </div>
    </div>
  );
});
ActionPointsStrip.displayName = 'ActionPointsStrip';
