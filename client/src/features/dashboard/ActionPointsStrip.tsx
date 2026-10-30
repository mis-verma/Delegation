import { memo } from 'react';
import { Handshake, ShieldCheck, Ticket, ListTodo, Undo2 } from 'lucide-react';
import { InlineError } from '../../components/inlineError';
import { useActionPoints } from '../attention/useAttention';
import { useApprovalSources } from './useApprovalSources';
import { Stat } from './ApprovalStatsStrip';

const NO_POINTS = { openTickets: 0, overdueTickets: 0, openDelegations: 0, overdueDelegations: 0, sentBackRuns: 0 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ActionPointsStrip = memo(() => {
  const { queueHref, tasks, tickets } = useApprovalSources();
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

  return (
    <div className="@container border-b border-border/40 px-4 py-3 sm:px-5" role="group" aria-label="Action points">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-5">
        <Stat
          index={0}
          icon={Handshake}
          label="Delegation approvals"
          value={delegationApprovals}
          accent="green"
          caption={delegationApprovals === 0 ? 'Nothing to approve' : 'Waiting for sign-off'}
          loading={tasks.isPending}
          to={delegationApprovals > 0 ? queueHref : null}
        />
        <Stat
          index={1}
          icon={ShieldCheck}
          label="Ticket approvals"
          value={ticketApprovals}
          accent="sky"
          caption={ticketApprovals === 0 ? 'Nothing to approve' : 'Waiting for sign-off'}
          loading={tickets.isPending}
          to={ticketApprovals > 0 ? queueHref : null}
        />
        <Stat
          index={2}
          icon={Ticket}
          label="Open tickets"
          value={totals.openTickets}
          caption={totals.overdueTickets === 0 ? 'None overdue' : `${totals.overdueTickets} overdue`}
          accent={totals.overdueTickets > 0 ? 'red' : 'sky'}
          alert={totals.overdueTickets > 0}
          loading={pointsLoading}
          to="/tickets"
        />
        <Stat
          index={3}
          icon={ListTodo}
          label="Open delegations"
          value={totals.openDelegations}
          caption={totals.overdueDelegations === 0 ? 'None overdue' : `${totals.overdueDelegations} overdue`}
          accent={totals.overdueDelegations > 0 ? 'red' : 'green'}
          alert={totals.overdueDelegations > 0}
          loading={pointsLoading}
          to="/tasks"
        />
        <Stat
          index={4}
          icon={Undo2}
          label="Checklists sent back"
          value={totals.sentBackRuns}
          caption={totals.sentBackRuns === 0 ? 'None to redo today' : `${plural(totals.sentBackRuns, 'run', 'runs')} to redo today`}
          accent={totals.sentBackRuns > 0 ? 'red' : 'green'}
          alert={totals.sentBackRuns > 0}
          loading={pointsLoading}
        />
      </div>
    </div>
  );
});
ActionPointsStrip.displayName = 'ActionPointsStrip';
