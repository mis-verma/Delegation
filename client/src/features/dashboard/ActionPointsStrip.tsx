import { memo, useMemo } from 'react';
import { Handshake, ShieldCheck, Ticket, ListTodo, Undo2 } from 'lucide-react';
import { InlineError } from '../../components/inlineError';
import { useAttentionPeople } from '../attention/useAttention';
import { useApprovalSources } from './useApprovalSources';
import { Stat } from './ApprovalStatsStrip';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ActionPointsStrip = memo(() => {
  const { queueHref, tasks, tickets } = useApprovalSources();
  const people = useAttentionPeople();

  const totals = useMemo(() => {
    const t = { openTickets: 0, overdueTickets: 0, openDelegations: 0, overdueDelegations: 0, sentBack: 0 };
    for (const p of people.data ?? []) {
      t.openTickets += p.openTickets;
      t.overdueTickets += p.overdueTickets;
      t.openDelegations += p.openDelegations;
      t.overdueDelegations += p.overdueDelegations;
      t.sentBack += p.sentBackRuns;
    }
    return t;
  }, [people.data]);

  if (people.isError && !people.data) {
    return (
      <div className="px-4 py-3 sm:px-5 border-b border-border/40">
        <InlineError message="Couldn't load the action points." onRetry={() => void people.refetch()} />
      </div>
    );
  }

  const peopleLoading = people.isPending;
  const delegationApprovals = tasks.data?.total ?? 0;
  const ticketApprovals = tickets.data?.total ?? 0;

  return (
    <div className="@container border-b border-border/40 px-4 py-3 sm:px-5" role="group" aria-label="Action points">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-5">
        <Stat
          icon={Handshake}
          label="Delegation approvals"
          value={String(delegationApprovals)}
          caption={delegationApprovals === 0 ? 'Nothing to approve' : 'Waiting for sign-off'}
          loading={tasks.isPending}
          to={delegationApprovals > 0 ? queueHref : null}
        />
        <Stat
          icon={ShieldCheck}
          label="Ticket approvals"
          value={String(ticketApprovals)}
          caption={ticketApprovals === 0 ? 'Nothing to approve' : 'Waiting for sign-off'}
          loading={tickets.isPending}
          to={ticketApprovals > 0 ? queueHref : null}
        />
        <Stat
          icon={Ticket}
          label="Open tickets"
          value={String(totals.openTickets)}
          caption={totals.overdueTickets === 0 ? 'None overdue' : `${totals.overdueTickets} overdue`}
          tone={totals.overdueTickets > 0 ? 'danger' : 'default'}
          loading={peopleLoading}
          to="/tickets"
        />
        <Stat
          icon={ListTodo}
          label="Open delegations"
          value={String(totals.openDelegations)}
          caption={totals.overdueDelegations === 0 ? 'None overdue' : `${totals.overdueDelegations} overdue`}
          tone={totals.overdueDelegations > 0 ? 'danger' : 'default'}
          loading={peopleLoading}
          to="/tasks"
        />
        <Stat
          icon={Undo2}
          label="Checklists sent back"
          value={String(totals.sentBack)}
          caption={totals.sentBack === 0 ? 'None to redo today' : `${plural(totals.sentBack, 'run', 'runs')} to redo today`}
          tone={totals.sentBack > 0 ? 'danger' : 'success'}
          loading={peopleLoading}
        />
      </div>
    </div>
  );
});
ActionPointsStrip.displayName = 'ActionPointsStrip';
