import { useMemo } from 'react';
import { Link } from 'react-router';
import { ChevronRight, CheckCheck, Inbox, ShieldQuestion } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNow } from '../../lib/useNow';
import { isDepartmentHead } from '../../lib/ticketApproval';
import { IconChip } from '../../components/iconChip';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { useDepartmentsQuery, useTicketsBoardQuery } from '../tickets/hook';
import { HeadRequestRow } from '../tickets/approvals/HeadRequestRow';
import { cardIconTile } from './dashboardDisplay';
import type { Ticket } from '../../api/ticket';

const NO_TICKETS: Ticket[] = [];
const PREVIEW_LIMIT = 3;

export const TicketRequestsCard = () => {
  const { user } = useAuth();
  const now = useNow();
  const isAdmin = user?.role === 'ADMIN';
  const isHod = user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const allowed = isAdmin || isHod;
  const board = useTicketsBoardQuery(allowed);
  const { data: departments } = useDepartmentsQuery(allowed);

  const requests = useMemo(
    () => (board.data ?? NO_TICKETS)
      .filter((t) => !!t.awaitingHeadApproval && !t.declinedAt && !!user && (isAdmin || isDepartmentHead(user, t)))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [board.data, user, isAdmin],
  );

  if (!allowed) return null;
  if (isAdmin && !board.isPending && !board.isError && requests.length === 0) return null;
  if (board.isPending) {
    return (
      <section aria-label="Loading ticket requests" role="status" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-border/40">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  const visible = requests.slice(0, PREVIEW_LIMIT);
  const remaining = requests.length - visible.length;
  const oldestHours = requests.length ? Math.floor((now - new Date(requests[0].createdAt).getTime()) / 3_600_000) : 0;

  return (
    <section aria-labelledby="ticket-requests-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden ${requests.length > 0 ? 'border-warning/30' : ''}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cardIconTile('warning')}>
            <ShieldQuestion className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="ticket-requests-heading" className="t-section font-display font-bold text-text tracking-tight">Ticket requests</h2>
            <p className="hidden sm:block t-meta font-medium text-text-muted">
              {isAdmin ? 'Waiting for a department head' : 'Raised for your department. Decide before work starts'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {requests.length > 0 && <IconChip icon={Inbox} tone="bg-warning" label={requests.length} labelClassName="tabular-nums" />}
          {requests.length > 0 && (
            <Link
              viewTransition
              to="/tickets/approvals"
              className="inline-flex items-center gap-0.5 min-h-11 sm:min-h-9 px-2 rounded-lg text-sm font-display font-semibold text-primary-600 dark:text-primary-400 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Review all
              <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {board.isError && (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load ticket requests." onRetry={() => void board.refetch()} />
        </div>
      )}

      {!board.isError && requests.length === 0 && (
        <div className="p-4 sm:p-5">
          <EmptyState size="compact" tone="success" icon={CheckCheck} title="No requests waiting" description="New tickets raised for your department show up here for your decision." />
        </div>
      )}

      {requests.length > 0 && (
        <div className="flex flex-col divide-y divide-border/60">
          {oldestHours >= 4 && (
            <p className={`px-4 py-2 sm:px-5 t-meta font-display font-semibold ${oldestHours >= 24 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
              {oldestHours >= 24 ? 'The oldest request has waited over a day. Decide it now.' : `The oldest request has waited ${oldestHours} hours.`}
            </p>
          )}
          {visible.map((ticket) => (
            <HeadRequestRow
              key={ticket.id}
              ticket={ticket}
              now={now}
              embedded
              departmentName={isAdmin ? departments?.find((d) => d.id === ticket.departmentId)?.name : undefined}
            />
          ))}
        </div>
      )}

      {remaining > 0 && <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{remaining} more waiting</p>}
    </section>
  );
};
