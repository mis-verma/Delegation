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
import { ApprovalStatsStrip } from './ApprovalStatsStrip';
import { SendBackDialog } from './SendBackDialog';
import { canDecideInline, rowKey, useInlineDecisions } from './useInlineDecisions';
import { useQueueShortcuts } from '../verification/useQueueShortcuts';
import { ActionPointsStrip } from './ActionPointsStrip';
import { StatsBoundary } from './StatsBoundary';
import { PANEL_CLASS } from '../../components/entityCard';
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

export const NeedsApprovalCard = () => {
  const { reviewsAllWork, isHod, queueHref, tasks, tickets, checklists, isPending, hasError, total } = useApprovalSources();
  const isMobile = useIsMobile();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { heldIds, approve, sendBack } = useInlineDecisions();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sendBackRow, setSendBackRow] = useState<ApprovalRow | null>(null);
  const [engaged, setEngaged] = useState(false);

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
    return combined
      .filter((row) => !heldIds.has(rowKey(row)))
      .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
  }, [tickets.data, tasks.data, checklists.data, heldIds]);

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
  const notLoaded = Math.max(0, total - rows.length);

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

      {showsStats && (
        <>
          <StatsBoundary label="Approval figures"><ApprovalStatsStrip /></StatsBoundary>
          <StatsBoundary label="Action points"><ActionPointsStrip /></StatsBoundary>
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
            {(['ticket', 'delegation', 'checklist'] as const).filter((c) => categoryTotals[c] > 0).length > 1 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1 sm:px-5 sm:pt-4">
              {(['ticket', 'delegation', 'checklist'] as const)
                .filter((c) => categoryTotals[c] > 0)
                .map((c) => (
                  <span key={c} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 t-meta font-display font-bold', CATEGORY_PILL[c])}>
                    <span className="tabular-nums">{categoryTotals[c]}</span>
                    {ACTIVITY_CATEGORY_LABEL[c].toLowerCase()}{categoryTotals[c] === 1 ? '' : 's'}
                  </span>
                ))}
            </div>
            )}

            <div className="flex flex-col divide-y divide-border/60">
              {visible.map((row) => (
                <ApprovalLink
                  key={rowKey(row)}
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
              ))}
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
      {notLoaded > 0 && (
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
