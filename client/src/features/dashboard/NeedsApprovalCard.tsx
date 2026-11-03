import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { WaitChip } from '../../components/dueChip';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { useApprovalSources } from './useApprovalSources';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePcApprovalBuckets } from '../pc/usePcApprovalBuckets';
import { ApprovalStatsStrip, type ApprovalBucket } from './ApprovalStatsStrip';
import { SendBackDialog } from './SendBackDialog';
import { canDecideInline, rowKey, useInlineDecisions } from './useInlineDecisions';
import { useQueueShortcuts } from '../verification/useQueueShortcuts';
import { ActionPointsStrip } from './ActionPointsStrip';
import { StatsBoundary } from './StatsBoundary';
import { PANEL_CLASS } from '../../components/entityCard';
import { Segmented } from '../../components/segmented/Segmented';
import { ACTIVITY_CATEGORY_LABEL } from './dashboardDisplay';
import { CATEGORY_PILL } from './categoryLook';

type ApprovalCategory = 'ticket' | 'delegation' | 'checklist';

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
    className={cn('group flex flex-col transition-colors duration-150 hover:bg-surface-hover/50 sm:flex-row sm:items-center', selected && 'bg-surface-hover/70 ring-2 ring-inset ring-vivid-blue/40')}
  >
    <Link
      to={row.link}
      viewTransition
      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none transition-colors duration-150 active:bg-surface-hover focus-visible:bg-surface-hover sm:px-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="line-clamp-2 text-sm font-display font-semibold leading-snug text-text">{row.title.replace(/\.(\s+·|\s*$)/, '$1')}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-bold', CATEGORY_PILL[row.category])}>{ACTIVITY_CATEGORY_LABEL[row.category]}</span>
          <WaitChip since={row.waitingSince} now={now} plain />
          {row.meta && <span className="min-w-0 truncate t-meta font-medium text-text-secondary">{row.meta}</span>}
        </div>
      </div>
      {!actions && <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </Link>
    {actions && <div className="flex shrink-0 items-center gap-2 px-4 pb-3 sm:px-0 sm:pb-0 sm:pr-5">{actions}</div>}
  </div>
));
ApprovalLink.displayName = 'ApprovalLink';

export const NeedsApprovalCard = ({ hideStats = false }: { hideStats?: boolean }) => {
  const { reviewsAllWork, isHod, queueHref, tasks, tickets, checklists, isPending, hasError, total } = useApprovalSources();
  const isMobile = useIsMobile();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { heldIds, approve, sendBack } = useInlineDecisions();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sendBackRow, setSendBackRow] = useState<ApprovalRow | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [filter, setFilter] = useState<'all' | ApprovalCategory>('all');
  const [bucket, setBucket] = useState<ApprovalBucket>('all');
  const reduceMotion = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
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
  const activeFilter = filter !== 'all' && bucketRows.some((r) => r.category === filter) ? filter : 'all';
  const rows = useMemo(() => (activeFilter === 'all' ? bucketRows : bucketRows.filter((r) => r.category === activeFilter)), [bucketRows, activeFilter]);

  const previewLimit = isMobile ? MOBILE_PREVIEW_LIMIT : PREVIEW_LIMIT;
  const visible = useMemo(() => (expanded ? rows : rows.slice(0, previewLimit)), [expanded, rows, previewLimit]);
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

  const canExpand = rows.length > previewLimit;
  const notLoaded = Math.max(0, total - allRows.length);
  const bucketExpected = bucket === 'late' ? buckets.total.old : bucket === 'fresh' ? buckets.total.fresh : 0;
  const partial = bucket !== 'all' && activeFilter === 'all' && bucketExpected > rows.length;

  const failedSources = [
    (reviewsAllWork || isHod) && tickets.isError && { label: 'tickets', retry: () => void tickets.refetch() },
    (reviewsAllWork || isHod) && tasks.isError && { label: 'delegations', retry: () => void tasks.refetch() },
    checklists.isError && { label: 'checklists', retry: () => void checklists.refetch() },
  ].filter(Boolean) as { label: string; retry: () => void }[];

  const countOf = (c: ApprovalCategory) => bucketRows.filter((r) => r.category === c).length;
  const filterOptions = (['ticket', 'delegation', 'checklist'] as const)
    .filter((c) => countOf(c) > 0)
    .map((c) => ({ value: c, label: `${ACTIVITY_CATEGORY_LABEL[c]}s ${countOf(c)}` }));

  const nothingToShow = allRows.length === 0;
  const allCaughtUp = nothingToShow && !hasError && !isPending;

  return (
    <section aria-labelledby="needs-approval-heading" onPointerEnter={() => setEngaged(true)}
      onPointerLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false); }}
      className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id="needs-approval-heading" className="t-section font-display font-bold tracking-tight text-text">
            Needs your approval
          </h2>
          {!hasError && total > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-500/10 px-2 t-meta font-display font-bold tabular-nums text-primary-700 dark:text-primary-300" aria-label={`${total} waiting`}>{total}</span>
          )}
        </div>
        {queueHref && !nothingToShow && (
          <Link
            viewTransition
            to={queueHref}
            className="inline-flex h-11 shrink-0 items-center rounded-full border border-border px-3.5 text-sm font-display font-semibold text-text-secondary transition-colors hover:border-border-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-9"
          >
            Review all
          </Link>
        )}
      </div>

      {showsStats && !hideStats && (
        <>
          <StatsBoundary label="Approval figures"><ApprovalStatsStrip bucket={bucket} onBucket={setBucket} /></StatsBoundary>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5 text-left t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover sm:px-5"
          >
            {moreOpen ? 'Hide open work figures' : 'Show open work figures'}
            <ChevronDown className={cn('size-3.5 transition-transform duration-200', moreOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          <AnimatePresence initial={false}>
            {moreOpen && (
              <motion.div
                key="open-work"
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <StatsBoundary label="Action points"><ActionPointsStrip /></StatsBoundary>
              </motion.div>
            )}
          </AnimatePresence>
        </>
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
            <div key={i} className="flex min-h-14 flex-col justify-center gap-1.5 px-4 py-3 sm:px-5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        </div>
      ) : allCaughtUp ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center sm:px-5">
          <p className="t-card font-display font-semibold text-text">All caught up</p>
          <p className="t-meta text-text-muted">Nothing is waiting on your review right now.</p>
        </div>
      ) : (
        !nothingToShow && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4 pb-2 sm:px-5">
              <h3 className="t-meta font-display font-bold text-text">{BUCKET_TITLE[bucket]}</h3>
              {filterOptions.length > 1 && (
                <Segmented label="Filter approvals by type" value={activeFilter} onChange={(v) => setFilter(v === activeFilter ? 'all' : v)} options={filterOptions} />
              )}
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              <AnimatePresence initial={false} mode="popLayout">
              {visible.map((row) => (
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
                        className="inline-flex h-11 cursor-pointer items-center rounded-full border border-vivid-red/40 px-4 t-meta font-display font-bold text-vivid-red-text outline-none transition-colors duration-150 hover:bg-vivid-red/10 focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] lg:h-9"
                      >
                        Send back
                      </button>
                      <button
                        type="button"
                        onClick={() => approve(row)}
                        aria-label={`Approve ${row.title}`}
                        title="Approve (A)"
                        className="inline-flex h-11 cursor-pointer items-center rounded-full bg-vivid-green px-4 t-meta font-display font-bold text-on-vivid outline-none transition-colors duration-150 hover:bg-vivid-green/85 focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] lg:h-9"
                      >
                        Approve
                      </button>
                    </>
                  ) : undefined}
                />
                </motion.div>
              ))}
              </AnimatePresence>
              {visible.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center sm:px-5">
                  <p className="t-card font-display font-semibold text-text">Nothing in this view</p>
                  <button
                    type="button"
                    onClick={() => { setBucket('all'); setFilter('all'); }}
                    className="inline-flex h-11 cursor-pointer items-center rounded-full border border-border px-4 t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-9"
                  >
                    Show all
                  </button>
                </div>
              )}
            </div>
          </>
        )
      )}

      <div className="mt-auto flex flex-col">
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
      {partial && (
        <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">
          Showing {rows.length} of {bucketExpected}.{queueHref ? ' ' : ''}
          {queueHref && <Link to={queueHref} viewTransition className="font-semibold text-text-secondary underline underline-offset-2 hover:text-text">Open the queue for the rest</Link>}
        </p>
      )}
      {notLoaded > 0 && !partial && (
        queueHref ? (
          <Link
            to={queueHref}
            viewTransition
            className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover"
          >
            Open the queue for {notLoaded} more
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{notLoaded} more waiting</p>
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
