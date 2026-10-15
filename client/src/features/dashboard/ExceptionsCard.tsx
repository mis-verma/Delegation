import { memo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCheck, ChevronRight, ClipboardX, TicketX, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/http';
import { exceptionApi, peopleApi, type ExceptionItem, type ExceptionKind, type PersonStatus } from '../../api/exceptions';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { cardIconTile } from './dashboardDisplay';

const KIND_ICON: Record<ExceptionKind, LucideIcon> = {
  TICKET_OVERDUE: TicketX,
  TICKET_STALE: AlertTriangle,
  CHECKLIST_MISSED: ClipboardX,
};

const PREVIEW_LIMIT = 4;
const PEOPLE_PREVIEW_LIMIT = 2;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const PersonRow = memo(({ person }: { person: PersonStatus }) => (
  <div className="flex items-center gap-3 min-h-14 px-4 sm:px-5 py-3">
    <span className="flex items-center justify-center size-9 rounded-xl shrink-0 text-white bg-linear-to-br from-primary-500 to-primary-600">
      <UserRound className="size-4" strokeWidth={2.25} aria-hidden="true" />
    </span>
    <div className="flex flex-1 min-w-0 flex-col gap-0.5">
      <p className="line-clamp-1 text-sm font-display font-medium sm:font-semibold text-text leading-snug">{person.name}</p>
      <p className="t-meta font-medium text-text-muted line-clamp-2">
        {[
          person.notStartedRuns > 0 && `${plural(person.notStartedRuns, "checklist")} not started`,
          person.overdueDelegations > 0 && `${person.overdueDelegations} of ${plural(person.openDelegations, "delegation")} overdue`,
        ].filter(Boolean).join(" · ")}
      </p>
    </div>
  </div>
));
PersonRow.displayName = "PersonRow";

const ExceptionRow = memo(({ item }: { item: ExceptionItem }) => {
  const Icon = KIND_ICON[item.kind];
  const high = item.severity === 'high';
  return (
    <Link
      to={item.link}
      viewTransition
      className="flex items-center gap-3 min-h-14 px-4 sm:px-5 py-3 outline-none transition-colors duration-150 hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover"
    >
      <span className={cn('flex items-center justify-center size-9 rounded-xl shrink-0 text-white', high ? 'bg-linear-to-br from-danger to-danger/70' : 'bg-linear-to-br from-warning to-warning/70')}>
        <Icon className="size-4" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-display font-medium sm:font-semibold text-text leading-snug">{item.title}</p>
        <p className="t-meta font-medium text-text-muted line-clamp-2">
          {item.storeName ? `${item.storeName} · ` : ''}{item.detail}
        </p>
      </div>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted" aria-hidden="true" />
    </Link>
  );
});
ExceptionRow.displayName = 'ExceptionRow';

/**
 * What has gone wrong and still needs someone: overdue or stale urgent tickets, checklist runs that
 * closed unsubmitted today, and approvals waiting past 24 hours. The server scopes every row to what
 * the viewer may see (Admin/PC org-wide, Manager/Senior their own area), so this card only draws.
 * Calm by design: nothing wrong is "All clear", not a hidden card, because that is the answer an
 * overseer wants.
 */
export const ExceptionsCard = () => {
  const { user, token } = useAuth();
  const allowed = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const query = useQuery({
    queryKey: ['exceptions'] as const,
    queryFn: exceptionApi.list,
    enabled: !!token && allowed,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const people = useQuery({
    queryKey: ["exceptions", "people"] as const,
    queryFn: peopleApi.list,
    enabled: !!token && allowed,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  // An older server without this endpoint (404) or a role it refuses (403) is not an error to show on a glance screen.
  const unavailable = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
  if (!allowed || unavailable) return null;
  const peopleRows = people.data ?? [];
  const items = query.data ?? [];
  const visible = items.slice(0, PREVIEW_LIMIT);
  const remaining = items.length - visible.length;

  return (
    <section aria-labelledby="exceptions-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cardIconTile('danger')}>
            <AlertTriangle className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="exceptions-heading" className="t-section font-display font-bold text-text tracking-tight">Needs attention</h2>
            <p className="hidden sm:block t-meta font-medium text-text-muted">Late, stuck or waiting too long</p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1.5 rounded-full bg-danger/10 text-danger text-xs font-display font-bold tabular-nums">
            {items.length}
          </span>
        )}
      </div>

      {query.isPending ? (
        <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading alerts">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load alerts." onRetry={() => void query.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState size="compact" tone="success" icon={CheckCheck} title="All clear" description="Nothing is late or stuck right now." />
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {visible.map((item) => <ExceptionRow key={item.id} item={item} />)}
        </div>
      )}

      {remaining > 0 && <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{remaining} more</p>}

      {peopleRows.length > 0 && (
        <>
          <h3 className="border-t border-border/60 px-4 pt-3 pb-1 sm:px-5 t-meta font-display font-bold text-text-muted">To chase today</h3>
          <div className="flex flex-col divide-y divide-border/60">
            {peopleRows.slice(0, PEOPLE_PREVIEW_LIMIT).map((p) => <PersonRow key={p.userId} person={p} />)}
          </div>
          {peopleRows.length > PEOPLE_PREVIEW_LIMIT && <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{peopleRows.length - PEOPLE_PREVIEW_LIMIT} more people</p>}
        </>
      )}
    </section>
  );
};
