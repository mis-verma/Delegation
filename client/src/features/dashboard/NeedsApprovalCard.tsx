import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { ShieldAlert, ChevronRight, CheckCheck, User } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { WaitChip } from '../../components/dueChip';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
import { InlineError } from '../../components/inlineError';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { useApprovalSources } from './useApprovalSources';
import { PANEL_CLASS } from '../../components/entityCard';
import { ACTIVITY_CATEGORY_LABEL, ACTIVITY_CATEGORY_DOT_CLASS, cardIconTile } from './dashboardDisplay';
import { CATEGORY_ICON, CATEGORY_PILL, CATEGORY_TILE } from './categoryLook';

type ApprovalCategory = 'ticket' | 'delegation' | 'checklist';

export interface ApprovalRow {
  id: string;
  category: ApprovalCategory;
  title: string;
  meta: string | null;
  waitingSince: string;
  link: string;
}

const PREVIEW_LIMIT = 6;
const MOBILE_PREVIEW_LIMIT = 3;

export const ApprovalLink = memo(({ row, now }: { row: ApprovalRow; now: number }) => {
  const Icon = CATEGORY_ICON[row.category];
  return (
    <Link
      to={row.link}
      viewTransition
      className="group flex items-center gap-3 min-h-14 px-4 sm:px-5 py-2.5 outline-none transition-colors duration-150 hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover"
    >
      <span className={cn('flex items-center justify-center size-10 rounded-xl shrink-0 text-white', CATEGORY_TILE[row.category])}>
        <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="flex flex-1 min-w-0 flex-col gap-1.5">
        <p className="line-clamp-2 text-sm font-display font-medium sm:font-semibold text-text leading-snug">{row.title.replace(/\.(\s+·|\s*$)/, '$1')}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-semibold', CATEGORY_PILL[row.category])}>{ACTIVITY_CATEGORY_LABEL[row.category]}</span>
          <WaitChip since={row.waitingSince} now={now} />
          {row.meta && (
            <span className="inline-flex min-w-0 items-center gap-1 t-meta font-medium text-text-muted">
              <User className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{row.meta}</span>
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
});
ApprovalLink.displayName = 'ApprovalLink';

export const NeedsApprovalCard = () => {
  const { reviewsAllWork, isHod, queueHref, tasks, tickets, checklists, isPending, hasError, total } = useApprovalSources();
  const isMobile = useIsMobile();
  const now = useNow();

  const rows = useMemo<ApprovalRow[]>(() => {
    const combined: ApprovalRow[] = [
      ...(tickets.data?.rows ?? []).map((t): ApprovalRow => ({
        id: t.id, category: 'ticket', title: t.title, meta: t.submittedBy, waitingSince: t.waitingSince, link: `/tickets?open=${t.id}`,
      })),
      ...(tasks.data?.rows ?? []).map((t): ApprovalRow => ({
        id: t.id, category: 'delegation', title: t.title, meta: t.submittedBy, waitingSince: t.waitingSince, link: `/tasks?open=${t.id}`,
      })),
      ...(checklists.data?.rows ?? []).map((c): ApprovalRow => ({
        id: c.id, category: 'checklist', title: c.title, meta: c.storeName, waitingSince: c.waitingSince, link: `/checklists/${c.id}`,
      })),
    ];
    return combined.sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
  }, [tickets.data, tasks.data, checklists.data]);

  if (!reviewsAllWork && !hasError && (isPending || total === 0)) return null;

  const visible = rows.slice(0, isMobile ? MOBILE_PREVIEW_LIMIT : PREVIEW_LIMIT);
  const remaining = total - visible.length;

  const categoryTotals: Record<ApprovalCategory, number> = {
    ticket: reviewsAllWork || isHod ? (tickets.data?.total ?? 0) : 0,
    delegation: reviewsAllWork || isHod ? (tasks.data?.total ?? 0) : 0,
    checklist: checklists.data?.total ?? 0,
  };

  const failedSources = [
    (reviewsAllWork || isHod) && tickets.isError && { label: 'tickets', retry: () => void tickets.refetch() },
    (reviewsAllWork || isHod) && tasks.isError && { label: 'delegations', retry: () => void tasks.refetch() },
    (reviewsAllWork || isHod) && checklists.isError && { label: 'checklists', retry: () => void checklists.refetch() },
  ].filter(Boolean) as { label: string; retry: () => void }[];

  const nothingToShow = rows.length === 0;
  const allCaughtUp = nothingToShow && !hasError && !isPending;

  return (
    <section aria-labelledby="needs-approval-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cardIconTile('primary')}>
            <ShieldAlert className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="needs-approval-heading" className="t-section font-display font-bold text-text tracking-tight">
              Needs your approval
            </h2>
            <p className="hidden sm:block t-meta font-medium text-text-muted">
              Waiting on your sign-off
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!hasError && total > 0 && (
            <IconChip icon={ShieldAlert} tone="bg-primary-600" label={total} labelClassName="tabular-nums" />
          )}
          {queueHref && !nothingToShow && (
            <Link
              viewTransition
              to={queueHref}
              className="inline-flex items-center gap-0.5 min-h-11 sm:min-h-9 px-2 rounded-lg text-sm font-display font-semibold text-primary-600 dark:text-primary-400 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Review all
              <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {failedSources.length > 0 && (
        <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
          {failedSources.map((source) => (
            <InlineError key={source.label} message={`Couldn't load ${source.label} waiting for approval.`} onRetry={source.retry} />
          ))}
        </div>
      )}

      {isPending && nothingToShow ? (
        <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading approvals">
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
      ) : allCaughtUp ? (
        <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
          <EmptyState size="compact" tone="success" icon={CheckCheck} title="All caught up" description="Nothing is waiting on your review right now." />
        </div>
      ) : (
        !nothingToShow && (
          <>
            {(['ticket', 'delegation', 'checklist'] as const).filter((c) => categoryTotals[c] > 0).length > 1 && (
            <div className="hidden sm:flex flex-wrap gap-2 px-5 pt-4 pb-1">
              {(['ticket', 'delegation', 'checklist'] as const)
                .filter((c) => categoryTotals[c] > 0)
                .map((c) => (
                  <IconChip
                    key={c}
                    icon={CATEGORY_ICON[c]}
                    label={`${categoryTotals[c]} ${ACTIVITY_CATEGORY_LABEL[c].toLowerCase()}${categoryTotals[c] === 1 ? '' : 's'}`}
                    tone={ACTIVITY_CATEGORY_DOT_CLASS[c]}
                  />
                ))}
            </div>
            )}

            <div className="flex flex-col divide-y divide-border/60">
              {visible.map((row) => <ApprovalLink key={`${row.category}-${row.id}`} row={row} now={now} />)}
            </div>
          </>
        )
      )}

      {remaining > 0 && <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{remaining} more waiting</p>}
    </section>
  );
};
