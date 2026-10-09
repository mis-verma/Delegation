import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { ShieldAlert, TicketCheck, CheckSquare, ClipboardCheck, ChevronRight, ArrowUpRight, CheckCheck, type LucideIcon } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
import { InlineError } from '../../components/inlineError';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useApprovalSources } from './useApprovalSources';
import { PANEL_CLASS } from '../../components/entityCard';
import { formatRelativeTime, ACTIVITY_CATEGORY_LABEL, ACTIVITY_CATEGORY_DOT_CLASS } from './dashboardDisplay';

type ApprovalCategory = 'ticket' | 'delegation' | 'checklist';

interface ApprovalRow {
  id: string;
  category: ApprovalCategory;
  title: string;
  /** Submitter name for ticket/delegation, store name for checklist (no single submitter there). */
  meta: string | null;
  waitingSince: string;
  link: string;
}

const CATEGORY_ICON: Record<ApprovalCategory, LucideIcon> = {
  ticket: TicketCheck,
  delegation: CheckSquare,
  checklist: ClipboardCheck,
};

// "Preview, not the whole queue": this card is a way in, and the full queue lives behind Review all.
const PREVIEW_LIMIT = 6;
// Phones get the three oldest; six full rows was a screen and a half of scrolling on its own.
const MOBILE_PREVIEW_LIMIT = 3;

const ApprovalLink = memo(({ row }: { row: ApprovalRow }) => {
  const Icon = CATEGORY_ICON[row.category];
  return (
    <Link
      to={row.link}
      viewTransition
      className="group/row flex items-center gap-3 min-h-11 rounded-xl border border-border/60 bg-surface px-3 py-2.5 sm:px-3.5 sm:py-3 transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.985] motion-reduce:transition-none hover:border-primary-500/40 hover:bg-primary-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <div className="flex items-center justify-center size-7 rounded-md shrink-0 bg-primary-500/10 text-primary-600 dark:text-primary-400">
        <Icon size={14} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        {/* line-clamp-2, not truncate: this row's icon and chevron leave little width for the title
            on a phone, and truncate cut titles down to a fragment. */}
        <p className="text-sm font-display font-semibold text-text line-clamp-2 leading-snug">{row.title.replace(/\.(\s+·|\s*$)/, '$1')}</p>
        <p className="t-meta font-medium text-text-light flex items-center gap-1.5">
          {row.meta && (
            <>
              <span className="truncate">{row.meta}</span>
              <span className="size-1 rounded-full bg-border shrink-0" />
            </>
          )}
          <span className="text-primary-600 dark:text-primary-400 font-semibold shrink-0">Waiting {formatRelativeTime(row.waitingSince)}</span>
        </p>
      </div>
      <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-text-light group-hover/row:text-primary-600 dark:group-hover/row:text-primary-400 transition-colors duration-200" />
    </Link>
  );
});
ApprovalLink.displayName = 'ApprovalLink';

/**
 * The one dashboard block built from other people's submissions rather than the viewer's own work.
 * ADMIN/PC can verify any pending ticket, delegation or checklist, so for them this combines all
 * three into a single oldest-waiting-first queue. A MANAGER or SENIOR sees only the checklist
 * runs in their own department (the server scopes it). Everyone else never sees the block.
 *
 * A source that failed is reported on its own with a Retry, and the rows from sources that did load
 * still show. "All caught up" is only ever claimed when every source loaded and every queue is empty.
 */
export const NeedsApprovalCard = () => {
  const { reviewsAllWork, isHod, queueHref, tasks, tickets, checklists, isPending, hasError, total } = useApprovalSources();
  const isMobile = useIsMobile();

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

  // Not for people with nothing to review. A department head or named reviewer with an empty
  // queue gets no block at all (and none while it is still loading, so it cannot pop in and shift
  // the page); ADMIN/PC always keep it, because "All caught up" is a real answer for them.
  if (!reviewsAllWork && !hasError && (isPending || total === 0)) return null;

  const visible = rows.slice(0, isMobile ? MOBILE_PREVIEW_LIMIT : PREVIEW_LIMIT);
  const remaining = total - visible.length;

  // Real queue size per category, not the count of preview rows on screen.
  const categoryTotals: Record<ApprovalCategory, number> = {
    ticket: reviewsAllWork ? (tickets.data?.total ?? 0) : 0,
    delegation: reviewsAllWork ? (tasks.data?.total ?? 0) : 0,
    checklist: checklists.data?.total ?? 0,
  };

  const failedSources = [
    reviewsAllWork && tickets.isError && { label: 'tickets', retry: () => void tickets.refetch() },
    reviewsAllWork && tasks.isError && { label: 'delegations', retry: () => void tasks.refetch() },
    (reviewsAllWork || isHod) && checklists.isError && { label: 'checklists', retry: () => void checklists.refetch() },
  ].filter(Boolean) as { label: string; retry: () => void }[];

  const nothingToShow = rows.length === 0;
  const allCaughtUp = nothingToShow && !hasError && !isPending;

  return (
    <section aria-labelledby="needs-approval-heading" className={`${PANEL_CLASS} flex flex-col`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* One-off warm tile, not EntityIconTile's shared primary/coral: coral there is scoped to
              physical stores, and this block is the one place on the dashboard that reads as
              "waiting on you", so it earns its own accent. */}
          <div className="flex items-center justify-center size-7 sm:size-10 rounded-lg sm:rounded-xl shrink-0 text-primary-600 dark:text-primary-400 bg-primary-500/10 border border-primary-500/20">
            <ShieldAlert className="size-4 sm:size-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 id="needs-approval-heading" className="t-section font-display font-bold text-text tracking-tight">
              Needs your approval
            </h2>
            <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5">
              Waiting on your sign-off
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* No badge while any source is down: the sum would be a floor, not the real queue. */}
          {!hasError && total > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1.5 rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-display font-bold tabular-nums">
              {total}
            </span>
          )}
          {queueHref && !nothingToShow && (
            <Link
              viewTransition
              to={queueHref}
              className="inline-flex items-center gap-1 min-h-11 sm:min-h-9 px-2 rounded-lg text-sm font-display font-semibold text-primary-600 dark:text-primary-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Review all
              <ArrowUpRight size={14} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2.5 sm:gap-3 sm:p-4">
        {failedSources.map((source) => (
          <InlineError key={source.label} message={`Couldn't load ${source.label} waiting for approval.`} onRetry={source.retry} />
        ))}

        {isPending && nothingToShow ? (
          <div className="flex flex-col gap-1.5" role="status" aria-label="Loading approvals">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[3.25rem] rounded-xl" />)}
          </div>
        ) : allCaughtUp ? (
          // No CTA: this block is derived from other people's submissions, so there is nothing for
          // the viewer to go and create.
          <EmptyState size="compact" tone="success" icon={CheckCheck} title="All caught up" description="Nothing is waiting on your review right now." />
        ) : (
          !nothingToShow && (
            <>
              {/* Desktop-only: on a phone these chips just restate the rows right below them. */}
              {(['ticket', 'delegation', 'checklist'] as const).filter((c) => categoryTotals[c] > 0).length > 1 && (
              <div className="hidden sm:flex flex-wrap gap-2 px-1">
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 sm:gap-2">
                {visible.map((row) => <ApprovalLink key={`${row.category}-${row.id}`} row={row} />)}
              </div>
            </>
          )
        )}

        {remaining > 0 && <p className="px-1 t-meta font-medium text-text-light">+{remaining} more waiting</p>}
      </div>
    </section>
  );
};
