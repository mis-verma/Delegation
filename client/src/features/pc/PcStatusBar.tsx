import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { CalendarOff, ChevronRight, FileSpreadsheet, Grid3x3, ListOrdered, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { PANEL_CLASS } from '../../components/entityCard';
import { useOrgToday } from '../checklist/useOrgToday';
import { usePcApprovalBuckets } from './usePcApprovalBuckets';

const LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/admin/scores', label: 'Scores', icon: ListOrdered },
  { to: '/team/fill', label: 'Fill chart', icon: Grid3x3 },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/leave', label: 'Leave', icon: CalendarOff },
];

const QUICK_LINK = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] sm:min-h-9 sm:justify-start';

export const PcStatusBar = () => {
  const today = useOrgToday();
  const { approvals, total } = usePcApprovalBuckets();
  const loading = approvals.isPending;
  const failed = approvals.hasError && total.pending === 0;

  const lastOld = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (lastOld.current !== null && total.old > lastOld.current) {
      const added = total.old - lastOld.current;
      toast.warning(`${added} ${added === 1 ? 'approval' : 'approvals'} just passed 24 hours`);
    }
    lastOld.current = total.old;
  }, [total.old, loading]);

  const day = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section aria-label="Today" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          {loading ? (
            <Skeleton className="h-7 w-64 max-w-full" />
          ) : (
            <h2 className="t-title font-display font-bold text-text">
              {failed
                ? "Couldn't count your approvals"
                : total.pending === 0
                  ? 'Nothing is waiting for your decision'
                  : (
                    <>
                      <span className="tabular-nums">{total.pending}</span> waiting for your decision
                      {total.old > 0 && (
                        <span className="text-danger">, <span className="tabular-nums">{total.old}</span> over 24 hours</span>
                      )}
                    </>
                  )}
            </h2>
          )}
          <p className="t-meta text-text-muted">{day}</p>
        </div>
        <Link
          to="/verify"
          viewTransition
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary-800 px-5 text-sm font-display font-semibold text-white outline-none transition-colors duration-150 hover:bg-primary-900 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.985] dark:bg-primary-500 dark:hover:bg-primary-400 sm:h-10"
        >
          Open queue
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <nav aria-label="PC shortcuts" className="grid grid-cols-2 gap-2 border-t border-border/40 px-4 py-3 sm:flex sm:flex-wrap sm:px-5">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} viewTransition className={QUICK_LINK}>
            <Icon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </section>
  );
};
