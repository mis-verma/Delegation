import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { CheckCheck, ChevronRight, Undo2 } from 'lucide-react';
import { WaitChip } from '../../components/dueChip';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { useApprovalSources } from './useApprovalSources';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePcApprovalBuckets } from '../pc/usePcApprovalBuckets';
import { ApprovalStatsStrip, type ApprovalBucket, type ApprovalKind } from './ApprovalStatsStrip';
import { SendBackDialog } from './SendBackDialog';
import { canDecideInline, rowKey, useInlineDecisions } from './useInlineDecisions';
import { useQueueShortcuts } from '../verification/useQueueShortcuts';
import { StatsBoundary } from './StatsBoundary';
import { PANEL_CLASS } from '../../components/entityCard';
import { Segmented } from '../../components/segmented/Segmented';
import { ACTIVITY_CATEGORY_LABEL } from './dashboardDisplay';
import { CATEGORY_PILL } from './categoryLook';
import { DashCardHeader, DashCardLink } from './DashCardHeader';

type ApprovalCategory = ApprovalKind;

const CATEGORIES: readonly ApprovalCategory[] = ['ticket', 'delegation', 'checklist'];
const CATEGORY_PLURAL: Record<ApprovalCategory, string> = { ticket: 'Tickets', delegation: 'Delegations', checklist: 'Checklists' };
const GROUP_LIMIT = 3;
const MOBILE_GROUP_LIMIT = 2;

export interface ApprovalRow {
  id: string;
  category: ApprovalCategory;
  title: string;
  meta: string | null;
  waitingSince: string;
  link: string;
}

const LATE_MS = 24 * 60 * 60 * 1000;
const BUCKET_TITLE: Record<ApprovalBucket, string> = { all: 'Waiting list', late: 'Delayed, over 24 hours', fresh: 'New, under 24 hours' };
const PREVIEW_LIMIT = 6;
const MOBILE_PREVIEW_LIMIT = 3;

interface ApprovalLinkProps {
  row: ApprovalRow;
  now: number;
  selected?: boolean;
  actions?: ReactNode;
}

export const ApprovalLink = memo(({ row, now, selected = false, actions }: ApprovalLinkProps) => (
  <div
    data-approval-key={rowKey(row)}
    className={cn('group flex items-center transition-colors duration-150 hover:bg-surface-hover/50', selected && 'bg-surface-hover/70 ring-2 ring-inset ring-vivid-blue/40')}
  >
    <Link
      to={row.link}
      viewTransition
      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-3 outline-none transition-colors duration-150 active:bg-surface-hover focus-visible:bg-surface-hover sm:py-3 sm:pl-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 t-card font-display font-semibold leading-snug text-text">{row.title.replace(/\.(\s+·|\s*$)/, '$1')}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-bold', CATEGORY_PILL[row.category])}>{ACTIVITY_CATEGORY_LABEL[row.category]}</span>
          <WaitChip since={row.waitingSince} now={now} plain />
          {row.meta && <span className="min-w-0 truncate t-meta font-medium text-text-secondary max-sm:hidden">{row.meta}</span>}
        </div>
      </div>
      {!actions && <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </Link>
    {actions && <div className="flex shrink-0 items-center gap-2 pr-4 sm:pr-5">{actions}</div>}
  </div>
));
ApprovalLink.displayName = 'ApprovalLink';

export const NeedsApprovalCard = ({ hideStats = false, full = false }: { hideStats?: boolean; full?: boolean }) => {
  const { reviewsAllWork, isHod, queueHref, tasks, tickets, checklists, isPending, hasError, total } = useApprovalSources();
  const isMobile = useIsMobile();
  const now = useNow();
  const navigate = useNavigate();
  const { heldIds, approve, sendBack } = useInlineDecisions();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sendBackRow, setSendBackRow] = useState<ApprovalRow | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [filter, setFilter] = useState<'all' | ApprovalCategory>('all');
  const [bucket, setBucket] = useState<ApprovalBucket>('all');
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const pickBucket = useCallback((next: ApprovalBucket) => {
    setBucket(next);
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }));
  }, [reduceMotion]);
  const buckets = usePcApprovalBuckets();

  const allRows = useMemo<ApprovalRow[]>(() => {
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
    return combined
      .filter((row) => !heldIds.has(rowKey(row)))
      .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
  }, [tickets.data, tasks.data, checklists.data, heldIds]);
  const bucketRows = useMemo(() => {
    if (bucket === 'all') return allRows;
    const lateBefore = now - LATE_MS;
    return allRows.filter((r) => (new Date(r.waitingSince).getTime() < lateBefore) === (bucket === 'late'));
  }, [allRows, bucket, now]);
  const typeTotals: Record<ApprovalCategory, number> = {
    ticket: buckets.ticket.pending,
    delegation: buckets.delegation.pending,
    checklist: buckets.checklist.pending,
  };
  const activeFilter: 'all' | ApprovalCategory = full
    ? (filter !== 'all' && typeTotals[filter] > 0 ? filter : 'all')
    : (filter !== 'all' && bucketRows.some((r) => r.category === filter) ? filter : 'all');
  const rows = useMemo(() => (activeFilter === 'all' ? bucketRows : bucketRows.filter((r) => r.category === activeFilter)), [bucketRows, activeFilter]);

  const previewLimit = isMobile ? MOBILE_PREVIEW_LIMIT : PREVIEW_LIMIT;
  const groupLimit = isMobile ? MOBILE_GROUP_LIMIT : GROUP_LIMIT;
  const grouped = full && activeFilter === 'all';
  const visible = useMemo(
    () => (grouped
      ? CATEGORIES.flatMap((c) => rows.filter((r) => r.category === c).slice(0, groupLimit))
      : full ? rows : rows.slice(0, previewLimit)),
    [grouped, full, rows, groupLimit, previewLimit],
  );
  const canDecide = reviewsAllWork;

  const selectedRow = useMemo(() => visible.find((r) => rowKey(r) === selectedKey) ?? null, [visible, selectedKey]);

  const move = useCallback((delta: 1 | -1) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((r) => rowKey(r) === selectedKey);
    const next = index === -1 ? (delta === 1 ? 0 : visible.length - 1) : Math.min(visible.length - 1, Math.max(0, index + delta));
    const key = rowKey(visible[next]!);
    setSelectedKey(key);
    document.querySelector(`[data-approval-key="${key}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [visible, selectedKey]);

  useQueueShortcuts({
    enabled: canDecide && engaged && sendBackRow === null,
    sheetOpen: false,
    onNext: () => move(1),
    onPrevious: () => move(-1),
    onApprove: () => { if (selectedRow && canDecideInline(selectedRow)) approve(selectedRow); },
    onSendBack: () => { if (selectedRow && canDecideInline(selectedRow)) setSendBackRow(selectedRow); },
    onOpen: () => { if (selectedRow) navigate(selectedRow.link); },
    onClose: () => setSelectedKey(null),
    onHelp: () => undefined,
  });

  const showsStats = reviewsAllWork || isHod;

  if (!showsStats && !hasError && (isPending || total === 0)) return null;

  const unfiltered = bucket === 'all' && activeFilter === 'all';
  const typeNotLoaded = full && activeFilter !== 'all' && bucket === 'all' ? Math.max(0, typeTotals[activeFilter] - rows.length) : 0;
  const notLoaded = unfiltered ? Math.max(0, total - allRows.length) : typeNotLoaded;
  const moreCount = grouped ? 0 : rows.length - visible.length + notLoaded;
  const typeQueueHref = (category: ApprovalCategory): string | null => {
    if (!queueHref) return null;
    if (reviewsAllWork) return `/verify?tab=${category === 'ticket' ? 'tickets' : category === 'delegation' ? 'delegations' : 'checklists'}`;
    return category === 'checklist' ? '/tickets/approvals?tab=checklists' : '/tickets/approvals';
  };
  const moreHref = activeFilter === 'all' ? queueHref : typeQueueHref(activeFilter) ?? queueHref;
  const bucketExpected = bucket === 'late' ? buckets.total.old : bucket === 'fresh' ? buckets.total.fresh : 0;
  const partial = bucket !== 'all' && activeFilter === 'all' && bucketExpected > rows.length;

  const failedSources = [
    (reviewsAllWork || isHod) && tickets.isError && { label: 'tickets', retry: () => void tickets.refetch() },
    (reviewsAllWork || isHod) && tasks.isError && { label: 'delegations', retry: () => void tasks.refetch() },
    checklists.isError && { label: 'checklists', retry: () => void checklists.refetch() },
  ].filter(Boolean) as { label: string; retry: () => void }[];

  const countOf = (c: ApprovalCategory) => bucketRows.filter((r) => r.category === c).length;
  const filterOptions = CATEGORIES
    .filter((c) => countOf(c) > 0)
    .map((c) => ({ value: c, label: `${ACTIVITY_CATEGORY_LABEL[c]}s ${countOf(c)}` }));
  const typeOptions: { value: 'all' | ApprovalCategory; label: string }[] = [
    { value: 'all', label: `All ${total}` },
    ...CATEGORIES.filter((c) => typeTotals[c] > 0).map((c) => ({ value: c as 'all' | ApprovalCategory, label: `${CATEGORY_PLURAL[c]} ${typeTotals[c]}` })),
  ];

  const nothingToShow = allRows.length === 0;
  const allCaughtUp = nothingToShow && !hasError && !isPending;

  const renderRow = (row: ApprovalRow) => (
    <motion.div
      key={rowKey(row)}
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }}
    >
      <ApprovalLink
        row={row}
        now={now}
        selected={rowKey(row) === selectedKey}
        actions={canDecide && canDecideInline(row) ? (
          <>
            <button
              type="button"
              onClick={() => setSendBackRow(row)}
              aria-label={`Send back ${row.title}`}
              title="Send back (S)"
              className="inline-flex size-11 cursor-pointer items-center justify-center gap-1.5 rounded-full t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-vivid-red/10 hover:text-vivid-red-text focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] disabled:opacity-50 sm:w-auto sm:px-3 pointer-fine:h-9"
            >
              <Undo2 className="size-4 sm:hidden" aria-hidden="true" />
              <span className="max-sm:hidden">Send back</span>
            </button>
            <button
              type="button"
              onClick={() => approve(row)}
              aria-label={`Approve ${row.title}`}
              title="Approve (A)"
              className="inline-flex h-11 cursor-pointer items-center rounded-full bg-vivid-green px-4 t-meta font-display font-bold text-on-vivid outline-none transition-colors duration-150 hover:bg-vivid-green/85 focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] disabled:opacity-50 pointer-fine:h-9"
            >
              Approve
            </button>
          </>
        ) : canDecide ? (
          <Link
            to={row.link}
            viewTransition
            aria-label={`Review ${row.title}`}
            className="inline-flex h-11 items-center gap-1 rounded-full border border-border px-4 t-meta font-display font-bold text-text outline-none transition-colors duration-150 hover:border-border-hover hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] pointer-fine:h-9"
          >
            Review
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : undefined}
      />
    </motion.div>
  );

  return (
    <section aria-labelledby="needs-approval-heading" onPointerEnter={() => setEngaged(true)}
      onPointerLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false); }}
      className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <DashCardHeader
        id="needs-approval-heading"
        title="Needs your approval"
        count={hasError ? null : total}
        countLabel={`${total} waiting`}
        alert={buckets.total.old > 0}
        action={queueHref ? <DashCardLink to={queueHref} label={total > 0 ? `Open the approval queue, ${total} waiting` : 'Open the approval queue'}>Open queue</DashCardLink> : undefined}
      />

      {showsStats && !hideStats && !allCaughtUp && (
        <StatsBoundary label="Approval figures"><ApprovalStatsStrip kind={full ? activeFilter : 'all'} bucket={bucket} onBucket={pickBucket} /></StatsBoundary>
      )}

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
            <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
              {canDecide && <Skeleton className="h-9 w-20 shrink-0 rounded-full" />}
            </div>
          ))}
        </div>
      ) : allCaughtUp ? (
        <p className="flex items-center gap-2 px-4 py-3 t-meta font-medium text-text-secondary sm:px-5">
          <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
          All caught up. New hand-ins show up here as they arrive.
        </p>
      ) : (
        !nothingToShow && (
          <>
            <div
              ref={listRef}
              className={cn(
                'scroll-mt-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3 pb-1 sm:px-5',
                full || bucket !== 'all' || filterOptions.length > 1 ? 'flex' : 'hidden sm:flex',
              )}
            >
              <h3 className="t-meta font-display font-bold text-text">{BUCKET_TITLE[bucket]}</h3>
              {full ? (
                typeOptions.length > 2 && (
                  <Segmented label="Show approvals of one type" value={activeFilter} onChange={setFilter} options={typeOptions} className="w-full sm:w-auto" />
                )
              ) : filterOptions.length > 1 && (
                <div className="max-sm:hidden">
                  <Segmented label="Filter approvals by type" value={activeFilter} onChange={(v) => setFilter(v === activeFilter ? 'all' : v)} options={filterOptions} />
                </div>
              )}
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              {grouped ? (
                CATEGORIES.map((category) => {
                  const items = rows.filter((r) => r.category === category);
                  const groupTotal = bucket === 'all' ? Math.max(typeTotals[category], items.length) : items.length;
                  if (groupTotal === 0) return null;
                  const shown = items.slice(0, groupLimit);
                  const hidden = groupTotal - shown.length;
                  return (
                    <div key={category} role="group" aria-label={`${CATEGORY_PLURAL[category]} waiting for approval`} className="flex flex-col divide-y divide-border/60">
                      <div className="flex items-center justify-between gap-3 bg-surface-hover/40 px-4 py-2 sm:px-5">
                        <h4 className="flex items-center gap-2 t-meta font-display font-bold text-text">
                          <span className={cn('rounded-full px-2 py-0.5', CATEGORY_PILL[category])}>{CATEGORY_PLURAL[category]}</span>
                          <span className="tabular-nums text-text-muted">{groupTotal}</span>
                        </h4>
                        {hidden > 0 && (
                          <button
                            type="button"
                            onClick={() => setFilter(category)}
                            aria-label={`See all ${groupTotal} ${CATEGORY_PLURAL[category].toLowerCase()} waiting`}
                            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-fine:min-h-8"
                          >
                            See all {groupTotal}
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {shown.map(renderRow)}
                      {shown.length === 0 && (
                        <p className="px-4 py-3 t-meta font-medium text-text-muted sm:px-5">{groupTotal} waiting. Tap See all to open them.</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map(renderRow)}
                </AnimatePresence>
              )}
              {visible.length === 0 && !grouped && (
                <div className="flex flex-col items-center gap-2 px-4 py-6 text-center sm:px-5">
                  <p className="t-card font-display font-semibold text-text">Nothing in this view</p>
                  <button
                    type="button"
                    onClick={() => { setBucket('all'); setFilter('all'); }}
                    className="inline-flex h-11 cursor-pointer items-center rounded-full border border-border px-4 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.985] pointer-fine:h-9"
                  >
                    Clear the filter
                  </button>
                </div>
              )}
            </div>
          </>
        )
      )}

      <div className="mt-auto flex flex-col">
      {partial ? (
        <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">
          Showing {visible.length} of {bucketExpected}.{moreHref ? ' ' : ''}
          {moreHref && <Link to={moreHref} viewTransition className="font-semibold text-text-secondary underline underline-offset-2 hover:text-text">Open the queue for the rest</Link>}
        </p>
      ) : moreCount > 0 && (
        moreHref ? (
          <Link
            to={moreHref}
            viewTransition
            className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2 sm:px-5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 hover:text-text focus-visible:bg-surface-hover"
          >
            {moreCount} more in the queue
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{moreCount} more waiting</p>
        )
      )}
      </div>

      {canDecide && rows.some(canDecideInline) && (
        <p className="hidden border-t border-border/60 px-5 py-2 t-meta font-medium text-text-muted pointer-fine:block" aria-hidden="true">
          J / K move · A approve · S send back · Enter open
        </p>
      )}

      <SendBackDialog
        title={sendBackRow?.title ?? null}
        onClose={() => setSendBackRow(null)}
        onSubmit={(note) => {
          if (sendBackRow) sendBack(sendBackRow, note);
          setSendBackRow(null);
        }}
      />
    </section>
  );
};
