import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ShieldAlert, ListChecks, Send, RotateCw, type LucideIcon } from 'lucide-react';
import { Button } from '../../components/button';
import { Skeleton } from '../../components/skeleton';
import { PANEL_CLASS } from '../../components/entityCard';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { useApprovalSources } from './useApprovalSources';
import type { DashboardSummaries, SummarySource } from './useDashboardSummaries';

type Tone = 'danger' | 'warning' | 'neutral';

const TONE_NUMBER: Record<Tone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-text',
};

const TONE_ICON: Record<Tone, string> = {
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  neutral: 'bg-primary-500/10 text-primary-600 dark:text-primary-400',
};

interface TodayTileProps {
  icon: LucideIcon;
  label: string;
  tone: Tone;
  /** Null while loading or when the source failed. */
  value: number | null;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  /** One short line under the number: where the figure comes from, or what it is made of. */
  detail: string;
  /** The filtered list this figure opens. */
  href: string;
}

const TodayTile = memo(({ icon: Icon, label, tone, value, isPending, isError, onRetry, detail, href }: TodayTileProps) => {
  const header = (
    <span className="flex items-center gap-2 min-w-0">
      <span className={`flex items-center justify-center size-7 rounded-lg shrink-0 ${TONE_ICON[tone]}`}>
        <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="text-xs font-display font-semibold text-text-secondary">{label}</span>
    </span>
  );

  if (isPending) {
    return (
      <div className={`${PANEL_CLASS} flex flex-col gap-2.5 p-3.5 min-h-[6.5rem]`} role="status" aria-label={`Loading ${label}`}>
        {header}
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  if (isError || value == null) {
    return (
      <div className={`${PANEL_CLASS} flex flex-col gap-1.5 p-3.5 min-h-[6.5rem]`}>
        {header}
        <p className="text-sm font-display font-semibold text-text-muted">No data</p>
        <Button variant="ghost" size="sm" onClick={onRetry} className="self-start -ml-2">Retry</Button>
      </div>
    );
  }

  const live = value > 0;
  return (
    <Link
      to={href}
      aria-label={`${label}: ${value}. ${detail}`}
      className={`${PANEL_CLASS} group flex flex-col gap-2 p-3.5 min-h-[6.5rem] transition-colors duration-200 hover:border-primary-500/40 active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
    >
      {header}
      <span className={`text-3xl font-display font-bold tabular-nums leading-none ${live ? TONE_NUMBER[tone] : 'text-text-muted'}`}>{value}</span>
      <span className="text-[11px] font-medium text-text-muted leading-snug line-clamp-2">{detail}</span>
    </Link>
  );
});
TodayTile.displayName = 'TodayTile';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface TodayStripProps {
  summaries: DashboardSummaries;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/**
 * The first thing on the page: what needs doing today, as four counts that each open the filtered
 * list behind them. Always the viewer's own work (see useDashboardSummaries), whatever their role.
 * The Awaiting approval tile only exists for roles that have an approval queue.
 */
export const TodayStrip = ({ summaries, onRefresh, isRefreshing }: TodayStripProps) => {
  const { user } = useAuth();
  const approvals = useApprovalSources();
  const { mine, updatedAt } = summaries;
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);

  const overdue = useMemo(() => {
    const parts: { n: number; one: string; many: string; href: string }[] = [
      // Managers and admins see more than their own work on these lists, so the link narrows to
      // theirs; front-line roles only ever see their own already.
      { n: mine.tasks.data?.overdue ?? 0, one: 'delegation', many: 'delegations', href: ownScopeOnly ? '/tasks?quickFilter=delayed' : '/tasks?quickFilter=delayed&mine=1' },
      { n: mine.tickets.data?.overdue ?? 0, one: 'ticket', many: 'tickets', href: ownScopeOnly || !user ? '/tickets?quickFilter=delayed' : `/tickets?quickFilter=delayed&assigneeIds=${user.id}` },
      { n: mine.checklist.data?.overdue ?? 0, one: 'checklist', many: 'checklists', href: '/checklists?status=overdue' },
      { n: mine.todos.data?.overdue ?? 0, one: 'todo', many: 'todos', href: '/todo?quickFilter=delayed' },
    ];
    const total = parts.reduce((sum, p) => sum + p.n, 0);
    const present = parts.filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
    return {
      total,
      // The tile opens the module with the most overdue; every module's own count is one tap away
      // on its KPI card below.
      href: present[0]?.href ?? '/tasks?quickFilter=delayed',
      detail: present.length ? present.map((p) => plural(p.n, p.one, p.many)).join(', ') : 'Nothing overdue',
    };
  }, [mine.tasks.data, mine.tickets.data, mine.checklist.data, mine.todos.data, ownScopeOnly, user]);

  const anyOf = (sources: SummarySource<unknown>[], key: 'isPending' | 'isError') => sources.some((s) => s[key]);
  const overdueSources = [mine.tasks, mine.tickets, mine.checklist, mine.todos] as SummarySource<unknown>[];
  const retryAll = (sources: SummarySource<unknown>[]) => () => sources.forEach((s) => { if (s.isError) s.onRetry(); });

  const checklistDue = mine.checklist.data?.pending ?? null;
  const checklistOverdue = mine.checklist.data?.overdue ?? 0;
  const ready = mine.readyToSubmit.data?.completed ?? null;

  // The approvals tile is for people with an approval job (ADMIN/PC, department heads) and for
  // anyone who was named a reviewer on at least one checklist. A reviewer without a queue page
  // lands on the oldest run waiting for them.
  const firstWaiting = approvals.checklists.data?.rows[0];
  const approvalsHref = approvals.queueHref ?? (firstWaiting ? `/checklists/${firstWaiting.id}` : null);
  const showApprovals = approvalsHref != null && (approvals.reviewsAllWork || approvals.isHod || approvals.total > 0);

  const updatedLabel = updatedAt
    ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : null;

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="today-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight">Today</h2>
        <div className="flex items-center gap-1">
          {updatedLabel && <span className="text-[11px] font-medium text-text-light tabular-nums">{updatedLabel}</span>}
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh the dashboard" className="shrink-0">
            <RotateCw size={14} strokeWidth={2.5} className={isRefreshing ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${showApprovals ? 'lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <TodayTile
          icon={AlertTriangle}
          label="Overdue"
          tone="danger"
          value={anyOf(overdueSources, 'isError') ? null : overdue.total}
          isPending={anyOf(overdueSources, 'isPending')}
          isError={anyOf(overdueSources, 'isError')}
          onRetry={retryAll(overdueSources)}
          detail={overdue.detail}
          href={overdue.href}
        />

        {showApprovals && (
          <TodayTile
            icon={ShieldAlert}
            label="Awaiting my approval"
            tone="warning"
            value={approvals.hasError ? null : approvals.total}
            isPending={approvals.isPending && approvals.total === 0}
            isError={approvals.hasError}
            onRetry={() => {
              if (approvals.tasks.isError) void approvals.tasks.refetch();
              if (approvals.tickets.isError) void approvals.tickets.refetch();
              if (approvals.checklists.isError) void approvals.checklists.refetch();
            }}
            detail={approvals.reviewsAllWork ? 'Tickets, delegations and checklists' : approvals.isHod ? 'Checklists in your department' : 'Checklists you review'}
            href={approvalsHref ?? '/'}
          />
        )}

        <TodayTile
          icon={ListChecks}
          label="My checklists due"
          tone="neutral"
          value={checklistDue}
          isPending={mine.checklist.isPending}
          isError={mine.checklist.isError}
          onRetry={mine.checklist.onRetry}
          detail={checklistOverdue > 0 ? `${checklistOverdue} of them overdue` : 'All on track'}
          href="/checklists?status=pending"
        />

        <TodayTile
          icon={Send}
          label="Ready to submit"
          tone="warning"
          value={ready}
          isPending={mine.readyToSubmit.isPending}
          isError={mine.readyToSubmit.isError}
          onRetry={mine.readyToSubmit.onRetry}
          detail="Finished, not yet sent for approval"
          href="/checklists?status=completed"
        />
      </div>
    </section>
  );
};
