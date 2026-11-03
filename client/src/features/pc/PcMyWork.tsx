import { Link } from 'react-router';
import { ClipboardCheck, ClipboardList, TicketCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { useMySummaries } from './useMySummaries';

interface Cell {
  value: number | null;
  to: string;
  label: string;
  late?: boolean;
}

interface Row {
  key: string;
  name: string;
  icon: LucideIcon;
  cells: [Cell, Cell, Cell];
}

const COLUMNS = ['Today', 'Open', 'Late'] as const;

const CELL_LINK = 'flex min-h-11 w-full items-center justify-end px-4 font-display font-bold tabular-nums outline-none transition-colors duration-150 hover:bg-surface-hover/60 focus-visible:bg-surface-hover sm:px-5';

const NumberCell = ({ cell, loading }: { cell: Cell; loading: boolean }) => (
  <td className="p-0 text-right">
    {loading ? (
      <span className="flex min-h-11 items-center justify-end px-4 sm:px-5"><Skeleton className="h-5 w-8" /></span>
    ) : (
      <Link
        to={cell.to}
        viewTransition
        aria-label={`${cell.label}: ${cell.value ?? 'not loaded'}`}
        className={cn(CELL_LINK, 't-card', cell.value === null || cell.value === 0 ? 'text-text-light' : cell.late ? 'text-danger' : 'text-text')}
      >
        {cell.value ?? '-'}
      </Link>
    )}
  </td>
);

export const PcMyWork = () => {
  const mine = useMySummaries();
  const failed = mine.isError && !mine.tickets && !mine.tasks && !mine.checklists;

  const rows: Row[] = [
    {
      key: 'tickets',
      name: 'Tickets',
      icon: TicketCheck,
      cells: [
        { value: mine.tickets?.newToday ?? null, to: '/tickets', label: 'Tickets raised today' },
        { value: mine.tickets?.pending ?? null, to: '/tickets?quickFilter=pending', label: 'Open tickets' },
        { value: mine.tickets?.overdue ?? null, to: '/tickets?quickFilter=delayed', label: 'Late tickets', late: true },
      ],
    },
    {
      key: 'delegations',
      name: 'Delegations',
      icon: ClipboardList,
      cells: [
        { value: mine.tasks?.newToday ?? null, to: '/tasks', label: 'Delegations created today' },
        { value: mine.tasks?.pending ?? null, to: '/tasks?quickFilter=pending', label: 'Open delegations' },
        { value: mine.tasks?.overdue ?? null, to: '/tasks?quickFilter=delayed', label: 'Late delegations', late: true },
      ],
    },
    {
      key: 'checklists',
      name: 'Checklists',
      icon: ClipboardCheck,
      cells: [
        { value: mine.checklists?.total ?? null, to: '/checklists', label: 'Checklist runs today' },
        { value: mine.checklists?.pending ?? null, to: '/checklists', label: 'Checklist runs not finished' },
        { value: mine.checklists?.overdue ?? null, to: '/checklists', label: 'Checklist runs past their deadline', late: true },
      ],
    },
  ];

  const done = mine.checklists?.completed ?? 0;
  const runs = mine.checklists?.total ?? 0;
  const withApprover = mine.approval?.withApprover ?? 0;
  const sentBack = mine.approval?.sentBack ?? 0;
  const approverNames = mine.approval?.heads.length ? `an Admin or ${mine.approval.heads.slice(0, 2).join(' or ')}` : 'an Admin or your head';

  return (
    <section aria-labelledby="pc-my-work-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <h2 id="pc-my-work-heading" className="t-section font-display font-bold text-text">My own work</h2>
        <p className="hidden t-meta text-text-muted sm:block">Given to you, not approvals</p>
      </div>

      {failed ? (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load your own work." onRetry={mine.retry} />
        </div>
      ) : (
        <>
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-border/40">
                <th scope="col" className="w-[40%] px-4 py-2 text-left t-meta font-semibold text-text-muted sm:px-5">
                  <span className="sr-only">Type</span>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-4 py-2 text-right t-meta font-semibold text-text-muted sm:px-5">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map(({ key, name, icon: Icon, cells }) => (
                <tr key={key}>
                  <th scope="row" className="px-4 text-left sm:px-5">
                    <span className="flex min-h-11 items-center gap-2 t-card font-display font-semibold text-text">
                      <Icon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span className="truncate">{name}</span>
                    </span>
                  </th>
                  {cells.map((cell) => (
                    <NumberCell key={cell.label} cell={cell} loading={mine.isPending} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-4 py-3 sm:px-5">
            {mine.isPending || mine.approvalPending ? (
              <Skeleton className="h-5 w-56" />
            ) : (
              <>
                <Link to="/checklists" viewTransition className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-9">
                  <span className="tabular-nums text-text">{done}/{runs}</span> checklists done today
                </Link>
                <Link
                  to="/checklists"
                  viewTransition
                  title={`Your finished checklists go to ${approverNames}. They do not come to you.`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-9"
                >
                  <span className="tabular-nums text-text">{withApprover}</span> with approver
                </Link>
                <Link
                  to="/checklists"
                  viewTransition
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-9',
                    sentBack > 0 ? 'border-danger/40 bg-danger/8 text-danger hover:border-danger/70' : 'border-border text-text-secondary hover:border-border-hover hover:text-text',
                  )}
                >
                  <span className="tabular-nums">{sentBack}</span> sent back
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
};
