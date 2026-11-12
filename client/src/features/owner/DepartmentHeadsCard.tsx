import { useMemo } from 'react';
import { Link } from 'react-router';
import { ChevronRight, UserRoundCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, InlineError, PANEL_CLASS, Skeleton } from '../../components';
import type { ExplorerRow } from '../../api/scores';
import { getInitials } from '../../lib/getInitials';
import { formatPct } from '../../lib/percent';
import { DashCardHeader, DashCardLink } from '../dashboard/DashCardHeader';
import { scorecardRowHref } from '../dashboard/scoreDrill';
import { TONE_TEXT, TONE_WORD, toneOf } from '../dashboard/scoreTone';
import { useAssignableUsersQuery } from '../tasks/hook';
import { HEAD_LIST_SIZE, headRowsFor, splitBestLowest, type HeadRow } from './departmentHeads';

const HeadItem = ({ row, rank, href }: { row: HeadRow; rank: number; href: string }) => {
  const tone = toneOf(row.score);
  return (
    <li>
      <Link
        to={href}
        viewTransition
        aria-label={`${rank}. ${row.name}, head of ${row.departmentName}. Department score ${formatPct(row.score)}, ${TONE_WORD[tone]}. Open the department`}
        className="group flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none transition-colors duration-150 ease-out hover:bg-surface-hover/50 focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 active:bg-surface-hover sm:px-5"
      >
        <span aria-hidden="true" className="w-5 shrink-0 t-meta font-display font-bold tabular-nums text-text-secondary">{rank}</span>
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-500/12 t-card font-display font-bold text-primary-700 dark:bg-primary-500/20 dark:text-primary-200">
          {getInitials(row.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 t-card font-display font-semibold leading-snug text-text">{row.name}</span>
          <span className="line-clamp-1 t-meta font-medium text-text-secondary">
            {row.departmentName}
            {row.role && <span className="text-text-muted">{`, ${row.role}`}</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={cn('t-stat font-display font-bold tabular-nums leading-none', TONE_TEXT[tone])}>{formatPct(row.score)}</span>
          <span className={cn('t-meta font-semibold', TONE_TEXT[tone])}>{TONE_WORD[tone]}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
};

const HeadList = ({ id, title, rows, rankOf, hrefFor }: { id: string; title: string; rows: HeadRow[]; rankOf: (i: number) => number; hrefFor: (row: HeadRow) => string }) => (
  <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col">
    <h3 id={id} className="px-4 pt-3 pb-1 t-card font-display font-bold text-text sm:px-5">{title}</h3>
    <ol className="flex flex-col divide-y divide-border/60">
      {rows.map((row, i) => <HeadItem key={row.key} row={row} rank={rankOf(i)} href={hrefFor(row)} />)}
    </ol>
  </div>
);

interface DepartmentHeadsCardProps {
  departments: readonly ExplorerRow[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  from: string;
  to: string;
}

export const DepartmentHeadsCard = ({ departments, loading, failed, onRetry, from, to }: DepartmentHeadsCardProps) => {
  const people = useAssignableUsersQuery();
  const { rows, unscored, anyHeads } = useMemo(() => headRowsFor(departments ?? [], people.data ?? []), [departments, people.data]);
  const { best, lowest } = splitBestLowest(rows);
  const peopleFailed = people.isError && !people.data;
  const hrefFor = (row: HeadRow) => scorecardRowHref('department', row.departmentId, from, to);
  const allHref = `/admin/scores?${new URLSearchParams({ view: 'department', from, to }).toString()}`;

  return (
    <section aria-labelledby="owner-heads-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <DashCardHeader
        id="owner-heads-heading"
        title="Department heads"
        subtitle="Each head with their department's score"
      />
      {failed || peopleFailed ? (
        <div className="p-4 sm:p-5">
          <InlineError
            message={failed ? "Couldn't load the department scores." : "Couldn't load the department heads."}
            onRetry={() => {
              if (failed) onRetry();
              if (peopleFailed) void people.refetch();
            }}
          />
        </div>
      ) : loading || people.isPending ? (
        <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading the department heads">
          {Array.from({ length: HEAD_LIST_SIZE }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            size="compact"
            icon={UserRoundCheck}
            title={anyHeads ? 'Nothing was due for any head yet' : 'No department heads yet'}
            description={anyHeads ? 'Heads show here once work in their department comes due in this period.' : 'Heads show here once a manager or senior is linked to a department.'}
          />
        </div>
      ) : (
        <div className="@container">
          <div className={cn('grid grid-cols-1 divide-y divide-border/60', lowest.length > 0 && '@2xl:grid-cols-2 @2xl:divide-x @2xl:divide-y-0')}>
            <HeadList id="owner-heads-best" title={lowest.length > 0 ? 'Best' : 'Ranked'} rows={best} rankOf={(i) => i + 1} hrefFor={hrefFor} />
            {lowest.length > 0 && (
              <HeadList id="owner-heads-lowest" title="Lowest" rows={[...lowest].reverse()} rankOf={(i) => rows.length - lowest.length + 1 + i} hrefFor={hrefFor} />
            )}
          </div>
        </div>
      )}
      {!loading && !failed && !peopleFailed && !people.isPending && (unscored > 0 || rows.length > 0) && (
        <div className="mt-auto flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 px-4 py-2 sm:px-5">
          <p className="t-meta font-medium text-text-secondary">
            {rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'head' : 'heads'} ranked` : ''}
            {rows.length > 0 && unscored > 0 ? ', ' : ''}
            {unscored > 0 ? `${unscored} with nothing due` : ''}
          </p>
          <DashCardLink to={allHref} label="Open every department score">All departments</DashCardLink>
        </div>
      )}
    </section>
  );
};
