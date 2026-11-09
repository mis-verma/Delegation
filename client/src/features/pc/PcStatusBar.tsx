import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  CalendarOff,
  ChevronRight,
  FileSpreadsheet,
  Grid3x3,
  ListOrdered,
  RotateCw,
  TicketCheck,
  ClipboardList,
  ClipboardCheck,
  CheckCheck,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { PANEL_CLASS } from '../../components/entityCard';
import { useOrgToday } from '../checklist/useOrgToday';
import { usePcApprovalBuckets } from './usePcApprovalBuckets';
import { haptic } from '../../lib/haptics';

const LINKS: { to: string; label: string; icon: LucideIcon; badge?: string }[] = [
  { to: '/admin/scores', label: 'Scores', icon: ListOrdered },
  { to: '/team/fill', label: 'Fill chart', icon: Grid3x3 },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/leave', label: 'Leave', icon: CalendarOff },
];

const QUICK_LINK =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface px-3.5 py-2 t-meta font-display font-semibold text-text-secondary outline-none transition-all duration-150 hover:border-primary-500/30 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] sm:min-h-9 sm:justify-start';

interface PcStatusBarProps {
  onRefreshAll?: () => Promise<void> | void;
}

export const PcStatusBar = ({ onRefreshAll }: PcStatusBarProps) => {
  const today = useOrgToday();
  const { approvals, ticket, delegation, checklist, total } = usePcApprovalBuckets();
  const loading = approvals.isPending;
  const failed = approvals.hasError && total.pending === 0;
  const [refreshing, setRefreshing] = useState(false);

  const lastOld = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (lastOld.current !== null && total.old > lastOld.current) {
      const added = total.old - lastOld.current;
      toast.warning(`${added} ${added === 1 ? 'approval' : 'approvals'} just passed 24 hours`);
    }
    lastOld.current = total.old;
  }, [total.old, loading]);

  const handleRefresh = async () => {
    haptic('tap');
    setRefreshing(true);
    try {
      if (onRefreshAll) {
        await onRefreshAll();
      } else {
        await Promise.all([
          approvals.tasks.refetch(),
          approvals.tickets.refetch(),
          approvals.checklists.refetch(),
        ]);
      }
      haptic('success');
      toast.success('PC desk refreshed');
    } catch {
      toast.error('Could not refresh PC desk');
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  const day = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <section
      aria-label="PC Desk Status"
      className={cn(
        PANEL_CLASS,
        'relative flex flex-col overflow-hidden border-border/70 bg-linear-to-r from-primary-500/[0.07] via-surface to-primary-500/[0.02] dark:from-primary-500/[0.12] dark:via-surface dark:to-surface'
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {total.pending > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-500/25 bg-primary-500/10 px-2.5 py-0.5 t-meta font-display font-bold text-primary-700 dark:text-primary-300">
                  <span className="live-dot size-2 rounded-full bg-primary-500 dark:bg-primary-400" aria-hidden="true" />
                  Active Queue
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 t-meta font-display font-bold text-success">
                  <CheckCheck className="size-3.5" aria-hidden="true" />
                  Queue Cleared
                </span>
              )}
              <span className="t-meta font-medium text-text-muted">{day}</span>
            </div>

            {loading ? (
              <Skeleton className="h-8 w-72 max-w-full rounded-md" />
            ) : (
              <h2 className="t-title font-display font-bold tracking-tight text-text">
                {failed ? (
                  "Couldn't count your approvals"
                ) : total.pending === 0 ? (
                  'All caught up — no decisions waiting'
                ) : (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span>
                      <span className="tabular-nums text-text">{total.pending}</span> waiting for your decision
                    </span>
                    {total.old > 0 && (
                      <span className="inline-flex items-center gap-1 text-danger font-semibold">
                        <Clock className="size-4 shrink-0" aria-hidden="true" />
                        <span className="tabular-nums">{total.old}</span> over 24h
                      </span>
                    )}
                  </span>
                )}
              </h2>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh PC desk"
              title="Refresh PC desk"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border/80 bg-surface text-text-secondary transition-all duration-200 hover:border-border-hover hover:bg-surface-hover hover:text-text active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer sm:size-10"
            >
              <RotateCw
                className={cn('size-4 transition-transform duration-500', refreshing && 'animate-spin text-primary-600 dark:text-primary-400')}
                aria-hidden="true"
              />
            </button>

            <Link
              to="/verify"
              viewTransition
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-800 px-5 text-sm font-display font-semibold text-white shadow-xs outline-none transition-all duration-150 hover:bg-primary-900 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.985] dark:bg-primary-500 dark:hover:bg-primary-400 sm:h-10 cursor-pointer"
            >
              <span>Open queue</span>
              {total.pending > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 t-meta font-bold tabular-nums">
                  {total.pending}
                </span>
              )}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {total.pending > 0 && !loading && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
            <span className="t-meta font-display font-medium text-text-muted">Breakdown:</span>
            {ticket.pending > 0 && (
              <Link
                to="/tickets?status=pending_approval"
                viewTransition
                className="inline-flex items-center gap-1.5 rounded-lg border border-coral-500/20 bg-coral-500/8 px-2.5 py-1 t-meta font-display font-semibold text-coral-700 transition-colors hover:bg-coral-500/15 dark:text-coral-300"
              >
                <TicketCheck className="size-3.5" aria-hidden="true" />
                <span className="tabular-nums">{ticket.pending}</span> tickets
              </Link>
            )}
            {delegation.pending > 0 && (
              <Link
                to="/tasks?status=pending_approval"
                viewTransition
                className="inline-flex items-center gap-1.5 rounded-lg border border-vivid-sky/20 bg-vivid-sky/8 px-2.5 py-1 t-meta font-display font-semibold text-vivid-sky-text transition-colors hover:bg-vivid-sky/15"
              >
                <ClipboardList className="size-3.5" aria-hidden="true" />
                <span className="tabular-nums">{delegation.pending}</span> delegations
              </Link>
            )}
            {checklist.pending > 0 && (
              <Link
                to="/checklists/approvals"
                viewTransition
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-500/20 bg-primary-500/8 px-2.5 py-1 t-meta font-display font-semibold text-primary-700 transition-colors hover:bg-primary-500/15 dark:text-primary-300"
              >
                <ClipboardCheck className="size-3.5" aria-hidden="true" />
                <span className="tabular-nums">{checklist.pending}</span> checklists
              </Link>
            )}
          </div>
        )}
      </div>

      <nav
        aria-label="PC shortcuts"
        className="grid grid-cols-2 gap-2 border-t border-border/40 bg-surface/50 p-3 sm:flex sm:flex-wrap sm:px-5 sm:py-2.5"
      >
        {LINKS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} viewTransition className={QUICK_LINK}>
            <Icon className="size-4 shrink-0 text-text-muted transition-colors group-hover:text-primary-600" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </section>
  );
};
