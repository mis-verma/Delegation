import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { CheckCheck, ChevronRight, CirclePlus, Clock3, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError } from '../../components/inlineError';
import type { MyApprovalCounts } from '../../api/dashboard';
import { useMyApprovalsQuery } from './useMyApprovals';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { CATEGORY_ICON } from './categoryLook';
import { StatStrip, type StatStripItem } from './StatStrip';

type Field = keyof MyApprovalCounts;

interface Row {
  key: 'tickets' | 'delegations' | 'checklists';
  label: string;
  icon: LucideIcon;
  base: string;
  href: string;
}

const METRICS: readonly { key: Field; label: string; caption: string; icon: LucideIcon; tint: StatStripItem['tint'] }[] = [
  { key: 'waiting', label: 'Waiting', caption: 'With your approver', icon: Clock3, tint: 'primary' },
  { key: 'delayed', label: 'Delayed', caption: 'Over 24 hours', icon: AlertTriangle, tint: 'danger' },
  { key: 'fresh', label: 'New', caption: 'Under 24 hours', icon: CirclePlus, tint: 'coral' },
  { key: 'approvedToday', label: 'Approved', caption: 'Today', icon: CheckCheck, tint: 'success' },
];

export const OwnApprovals = memo(({ userId }: { userId: string | undefined }) => {
  const query = useMyApprovalsQuery();
  const warm = usePrefetchRoute();
  const data = query.data;

  const rows = useMemo<Row[]>(() => [
    { key: 'tickets', label: 'Tickets', icon: CATEGORY_ICON.ticket, base: '/tickets', href: userId ? `/tickets?assigneeIds=${userId}` : '/tickets' },
    { key: 'delegations', label: 'Delegations', icon: CATEGORY_ICON.delegation, base: '/tasks', href: '/tasks?mine=1&status=pending_approval' },
    { key: 'checklists', label: 'Checklists', icon: CATEGORY_ICON.checklist, base: '/checklists', href: '/checklists?review=PENDING_APPROVAL' },
  ], [userId]);

  const items = useMemo<StatStripItem[]>(
    () => METRICS.map((m, index) => {
      const total = data ? data.tickets[m.key] + data.delegations[m.key] + data.checklists[m.key] : 0;
      return {
        key: m.key,
        label: m.label,
        value: total,
        caption: m.caption,
        icon: m.icon,
        tint: m.key === 'delayed' && total === 0 ? 'success' : m.tint,
        highlight: index === 0,
        loading: query.isPending && !data,
        failed: !data && query.isError,
      };
    }),
    [data, query.isPending, query.isError],
  );

  if (query.isError && !data) {
    return <InlineError message="Couldn't load your own approvals." onRetry={() => void query.refetch()} />;
  }

  const nothing = !!data && METRICS.every((m) => rows.every((r) => data[r.key][m.key] === 0));

  return (
    <div className="flex flex-col gap-3">
      <StatStrip items={items} label="My own work waiting for approval" />
      <section aria-label="My own approvals by area" className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-surface">
        <h3 className="px-4 py-2.5 t-meta font-display font-bold text-text">Your hand-ins by area</h3>
        {rows.map((row) => {
          const Icon = row.icon;
          const counts = data?.[row.key];
          return (
            <Link
              key={row.key}
              to={row.href}
              viewTransition
              onPointerEnter={() => warm(row.base)}
              onTouchStart={() => warm(row.base)}
              aria-label={`${row.label}: ${counts ? `${counts.waiting} waiting, ${counts.delayed} delayed, ${counts.approvedToday} approved today` : 'loading'}. Open`}
              className="group flex min-h-12 items-center gap-3 px-4 py-2 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover active:bg-surface-hover"
            >
              <Icon size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate t-card font-display font-semibold text-text">{row.label}</span>
              <span className="flex shrink-0 items-center gap-3 t-meta font-semibold tabular-nums">
                <span className="text-text">{counts ? `${counts.waiting} waiting` : '-'}</span>
                {counts && counts.delayed > 0 && <span className="text-danger">{counts.delayed} delayed</span>}
                {counts && counts.approvedToday > 0 && <span className={cn('text-success max-sm:hidden')}>{counts.approvedToday} approved</span>}
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          );
        })}
        {nothing && (
          <p className="flex items-center gap-2 px-4 py-3 t-meta font-medium text-text-secondary">
            <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
            Nothing of yours is waiting for approval.
          </p>
        )}
      </section>
    </div>
  );
});
OwnApprovals.displayName = 'OwnApprovals';
