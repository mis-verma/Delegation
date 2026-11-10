import { Link } from 'react-router';
import { ClipboardCheck, ClipboardList, TicketCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { useMySummaries } from './useMySummaries';
import { useAuth } from '../../context/AuthContext';

interface Cell {
  value: number | null;
  to: string;
  label: string;
  shortLabel: string;
  late?: boolean;
}

interface Row {
  key: string;
  name: string;
  icon: LucideIcon;
  tileClass: string;
  cells: [Cell, Cell, Cell];
}

const COLUMNS = ['Today', 'Open', 'Late'] as const;

const CELL_LINK =
  'flex min-h-11 w-full items-center justify-end px-4 font-display font-bold tabular-nums outline-none transition-colors duration-150 ease-out hover:bg-surface-hover/60 focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 sm:px-5';

const CHIP_LINK =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 t-meta font-display font-semibold outline-none transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-9 sm:pointer-coarse:min-h-11';

const NumberCell = ({ cell, loading }: { cell: Cell; loading: boolean }) => (
  <td className="p-0 text-right">
    {loading ? (
      <span className="flex min-h-11 items-center justify-end px-4 sm:px-5">
        <Skeleton className="h-5 w-8 rounded-sm" />
      </span>
    ) : (
      <Link
        to={cell.to}
        viewTransition
        aria-label={`${cell.label}: ${cell.value ?? 'not loaded'}`}
        className={cn(
          CELL_LINK,
          't-card',
          cell.value === null || cell.value === 0
            ? 'text-text-muted/60'
            : cell.late
              ? 'text-danger font-extrabold'
              : 'text-text font-bold'
        )}
      >
        {cell.value ?? '-'}
      </Link>
    )}
  </td>
);

export const PcMyWork = () => {
  const mine = useMySummaries();
  const { user } = useAuth();
  const failed = mine.isError && !mine.tickets && !mine.tasks && !mine.checklists;
  const myTickets = '/tickets?scope=ASSIGNED_TO_ME';
  const myTasks = `/tasks?category=work${user ? `&assigneeIds=${user.id}` : ''}`;

  const rows: Row[] = [
    {
      key: 'tickets',
      name: 'Tickets',
      icon: TicketCheck,
      tileClass: 'bg-coral-500/10 text-coral-600 dark:text-coral-300',
      cells: [
        { value: mine.tickets?.newToday ?? null, to: myTickets, label: 'Tickets given to you today', shortLabel: 'Today' },
        { value: mine.tickets?.pending ?? null, to: `${myTickets}&quickFilter=pending`, label: 'Your open tickets', shortLabel: 'Open' },
        { value: mine.tickets?.overdue ?? null, to: `${myTickets}&quickFilter=delayed`, label: 'Your late tickets', shortLabel: 'Late', late: (mine.tickets?.overdue ?? 0) > 0 },
      ],
    },
    {
      key: 'delegations',
      name: 'Delegations',
      icon: ClipboardList,
      tileClass: 'bg-vivid-sky/10 text-vivid-sky-text',
      cells: [
        { value: mine.tasks?.newToday ?? null, to: myTasks, label: 'Delegations given to you today', shortLabel: 'Today' },
        { value: mine.tasks?.pending ?? null, to: `${myTasks}&quickFilter=pending`, label: 'Your open delegations', shortLabel: 'Open' },
        { value: mine.tasks?.overdue ?? null, to: `${myTasks}&quickFilter=delayed`, label: 'Your late delegations', shortLabel: 'Late', late: (mine.tasks?.overdue ?? 0) > 0 },
      ],
    },
    {
      key: 'checklists',
      name: 'Checklists',
      icon: ClipboardCheck,
      tileClass: 'bg-primary-500/10 text-primary-600 dark:text-primary-300',
      cells: [
        { value: mine.checklists?.total ?? null, to: '/checklists', label: 'Your checklists today', shortLabel: 'Today' },
        { value: mine.checklists?.pending ?? null, to: '/checklists?status=pending', label: 'Your checklists not finished', shortLabel: 'Open' },
        { value: mine.checklists?.overdue ?? null, to: '/checklists?status=overdue', label: 'Your checklists past their deadline', shortLabel: 'Late', late: (mine.checklists?.overdue ?? 0) > 0 },
      ],
    },
  ];

  const done = mine.checklists?.completed ?? null;
  const runs = mine.checklists?.total ?? null;
  const approvalFailed = mine.approvalError && !mine.approval;
  const withApprover = mine.approval?.withApprover ?? 0;
  const sentBack = mine.approval?.sentBack ?? 0;
  const approverNames = mine.approval?.heads.length
    ? `an Admin or ${mine.approval.heads.slice(0, 2).join(' or ')}`
    : 'an Admin or your head';

  return (
    <section aria-labelledby="pc-my-work-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <div>
          <h2 id="pc-my-work-heading" className="t-section font-display font-bold text-text">
            My own work
          </h2>
          <p className="t-meta text-text-muted">Work given to you, not your team. Tap a number to open that list.</p>
        </div>
      </div>

      {failed ? (
        <div className="px-4 py-4 sm:px-5">
          <InlineError message="Couldn't load your own work." onRetry={mine.retry} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 p-3 sm:hidden">
            {rows.map(({ key, name, icon: Icon, tileClass, cells }) => (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/20 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', tileClass)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="t-card font-display font-bold text-text">{name}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {cells.map((cell) => (
                    <Link
                      key={cell.label}
                      to={cell.to}
                      viewTransition
                      aria-label={`${cell.label}: ${mine.isPending ? 'loading' : cell.value ?? 'not loaded'}`}
                      className={cn(
                        'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-center transition-[border-color,transform] duration-150 ease-out hover:border-border-hover active:scale-[0.985] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                        cell.late && 'border-danger/30 bg-danger/5'
                      )}
                    >
                      <span className="t-meta font-display font-medium text-text-muted">{cell.shortLabel}</span>
                      {mine.isPending ? (
                        <Skeleton className="h-4 w-6 rounded-sm" />
                      ) : (
                        <span
                          className={cn(
                            'text-base font-display font-bold tabular-nums',
                            cell.value === null || cell.value === 0
                              ? 'text-text-muted/60'
                              : cell.late
                                ? 'text-danger'
                                : 'text-text'
                          )}
                        >
                          {cell.value ?? '-'}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <table className="hidden w-full table-fixed border-collapse sm:table">
            <thead>
              <tr className="border-b border-border/40 bg-surface-hover/20">
                <th scope="col" className="w-[42%] px-4 py-2.5 text-left t-meta font-semibold text-text-muted sm:px-5">
                  <span>Category</span>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-4 py-2.5 text-right t-meta font-semibold text-text-muted sm:px-5">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map(({ key, name, icon: Icon, tileClass, cells }) => (
                <tr key={key} className="transition-colors hover:bg-surface-hover/30">
                  <th scope="row" className="px-4 text-left sm:px-5">
                    <span className="flex min-h-11 items-center gap-2.5 t-card font-display font-semibold text-text">
                      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', tileClass)}>
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span>{name}</span>
                    </span>
                  </th>
                  {cells.map((cell) => (
                    <NumberCell key={cell.label} cell={cell} loading={mine.isPending} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 bg-surface-hover/10 px-4 py-3 sm:px-5">
            {mine.isPending || mine.approvalPending ? (
              <Skeleton className="h-6 w-56 rounded-md" />
            ) : (
              <>
                <Link
                  to="/checklists?status=completed"
                  viewTransition
                  className={cn(CHIP_LINK, 'border-border/80 bg-surface text-text-secondary hover:border-border-hover hover:text-text')}
                >
                  <span className="tabular-nums font-bold text-text">
                    {done ?? '-'}/{runs ?? '-'}
                  </span>
                  checklists done today
                </Link>
                {approvalFailed ? (
                  <p className="flex flex-wrap items-center gap-x-2 t-meta font-medium text-text-muted" role="status">
                    Approval status didn't load.
                    <button
                      type="button"
                      onClick={mine.retry}
                      className="min-h-9 pointer-coarse:min-h-11 rounded-md px-1 font-semibold text-primary-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer dark:text-primary-300"
                    >
                      Try again
                    </button>
                  </p>
                ) : (
                  <>
                    <Link
                      to="/checklists?review=PENDING_APPROVAL"
                      viewTransition
                      title={`Your finished checklists go to ${approverNames}. They do not come to you.`}
                      aria-label={`${withApprover} of your checklists waiting with ${approverNames}`}
                      className={cn(CHIP_LINK, 'border-border/80 bg-surface text-text-secondary hover:border-border-hover hover:text-text')}
                    >
                      <span className="tabular-nums font-bold text-text">{withApprover}</span> with approver
                    </Link>
                    <Link
                      to="/checklists?review=REJECTED"
                      viewTransition
                      className={cn(
                        CHIP_LINK,
                        sentBack > 0
                          ? 'border-danger/40 bg-danger/10 text-danger hover:border-danger/70 font-bold'
                          : 'border-border/80 bg-surface text-text-secondary hover:border-border-hover hover:text-text'
                      )}
                    >
                      <span className="tabular-nums font-bold">{sentBack}</span> sent back
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
};
