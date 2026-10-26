import { useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTicketsQuery } from '../../../features/tickets/hook';
import { useTicketStatusMove } from '../../../features/tickets/useTicketStatusMove';
import { isTicketLate } from '../../../features/dashboard/dashboardDisplay';
import { DASHBOARD_QUERY_OPTIONS } from '../../../lib/dashboardQuery';
import { haptic } from '../../../lib/haptics';
import type { RestrictedStatus, Ticket } from '../../../api/ticket';
import { DueChip } from '../../dueChip';
import { QuickAction, QuickList, QuickRow } from './QuickRow';
import { QUICK_MAX, byDueThenNewest, type PanelProps } from './quickShared';

const NEXT: Partial<Record<Ticket['status'], { label: string; to: RestrictedStatus }>> = {
  OPEN: { label: 'Start', to: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Complete', to: 'PENDING_APPROVAL' },
  ON_HOLD: { label: 'Resume', to: 'IN_PROGRESS' },
};

export const QuickTickets = ({ now, onClose }: PanelProps) => {
  const { user } = useAuth();
  const query = useTicketsQuery(1, 100, undefined, true, DASHBOARD_QUERY_OPTIONS);
  const { requestMove, statusRemarkDialog } = useTicketStatusMove();
  const mine = useMemo(
    () =>
      (query.data?.data ?? [])
        .filter((t) => t.assigneeId === user?.id && NEXT[t.status] && !t.awaitingHeadApproval && !t.declinedAt)
        .map((t) => ({ ticket: t, due: t.tatDueAt ? new Date(t.tatDueAt).getTime() : null, created: new Date(t.createdAt).getTime() }))
        .sort(byDueThenNewest),
    [query.data, user?.id],
  );

  return (
    <>
      <QuickList
        pending={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        total={mine.length}
        emptyTitle="No tickets waiting on you"
        emptyHint="New ones will show up here."
      >
        {mine.slice(0, QUICK_MAX).map(({ ticket, due }) => {
          const next = NEXT[ticket.status];
          return (
            <QuickRow
              key={ticket.id}
              title={ticket.title}
              to={`/tickets?open=${ticket.id}`}
              onOpen={onClose}
              hot={isTicketLate(ticket)}
              meta={due !== null ? <DueChip at={due} now={now} /> : <span className="t-meta text-text-muted">No time limit</span>}
              action={next && <QuickAction label={next.label} onClick={() => { haptic('tap'); requestMove(ticket, next.to); }} />}
            />
          );
        })}
      </QuickList>
      {statusRemarkDialog}
    </>
  );
};
