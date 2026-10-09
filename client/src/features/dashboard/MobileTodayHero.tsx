import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ListChecks, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { useApprovalSources } from './useApprovalSources';
import type { DashboardSummaries } from './useDashboardSummaries';

interface QuickCountProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  href: string;
  /** Red when there is something to deal with, calm otherwise. */
  alert?: boolean;
}

const QuickCount = ({ icon: Icon, label, value, href, alert }: QuickCountProps) => {
  const live = value != null && value > 0;
  return (
    <Link
      viewTransition
      to={href}
      aria-label={`${label}: ${value ?? 'loading'}`}
      className={cn(
        'flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-center outline-none transition-[border-color,transform] duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
        live && alert ? 'border-danger/30 bg-danger/5' : 'border-border/60 bg-surface',
      )}
    >
      <span className={cn('flex items-center gap-1 t-meta font-display font-semibold', live && alert ? 'text-danger' : 'text-text-muted')}>
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span className={cn('text-xl font-display font-bold tabular-nums leading-tight', value == null ? 'text-text-light' : live && alert ? 'text-danger' : 'text-text')}>
        {value ?? '-'}
      </span>
    </Link>
  );
};

/**
 * The phone's first block: the three numbers a person acts on first (what is overdue, what waits for
 * their approval, which checklists are still due), each one tap from its list. The header above already
 * greets them with their name and the date, and the desktop Today strip is hidden on phones, so this is
 * the phone's short version of it.
 */
export const MobileTodayHero = ({ summaries }: { summaries: DashboardSummaries }) => {
  const { user } = useAuth();
  const approvals = useApprovalSources();
  const { mine } = summaries;
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);

  const overdue = useMemo(() => {
    const parts = [
      { n: mine.tasks.data?.overdue ?? 0, href: ownScopeOnly ? '/tasks?quickFilter=delayed' : '/tasks?quickFilter=delayed&mine=1' },
      { n: mine.tickets.data?.overdue ?? 0, href: ownScopeOnly || !user ? '/tickets?quickFilter=delayed' : `/tickets?quickFilter=delayed&assigneeIds=${user.id}` },
      { n: mine.checklist.data?.overdue ?? 0, href: '/checklists?status=overdue' },
      { n: mine.todos.data?.overdue ?? 0, href: '/todo?quickFilter=delayed' },
    ];
    const loaded = !mine.tasks.isPending && !mine.tickets.isPending && !mine.checklist.isPending && !mine.todos.isPending;
    const total = parts.reduce((s, p) => s + p.n, 0);
    // Opens the module with the most overdue.
    const top = [...parts].sort((a, b) => b.n - a.n)[0];
    return { total: loaded ? total : null, href: top.n > 0 ? top.href : '/tasks?quickFilter=delayed' };
  }, [mine.tasks, mine.tickets, mine.checklist, mine.todos, ownScopeOnly, user]);

  const approvalsHref = approvals.queueHref ?? (approvals.checklists.data?.rows[0] ? `/checklists/${approvals.checklists.data.rows[0].id}` : null);
  const showApprovals = approvalsHref != null && (approvals.reviewsAllWork || approvals.isHod || approvals.total > 0);
  const checklistsDue = mine.checklist.isPending ? null : (mine.checklist.data?.pending ?? 0);

  return (
    <section aria-label="Today" className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 bg-gradient-to-br from-primary-500/[0.07] to-transparent')}>
      <h2 className="px-0.5 t-meta font-display font-semibold text-text-secondary">Needs you today</h2>
      <div className="flex gap-2">
        <QuickCount icon={AlertTriangle} label="Overdue" value={overdue.total} href={overdue.href} alert />
        {showApprovals && (
          <QuickCount icon={ShieldCheck} label="To approve" value={approvals.isPending && approvals.total === 0 ? null : approvals.total} href={approvalsHref ?? '/'} alert />
        )}
        <QuickCount icon={ListChecks} label="Checklists" value={checklistsDue} href="/checklists?status=pending" />
      </div>
    </section>
  );
};
