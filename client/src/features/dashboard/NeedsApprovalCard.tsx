import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { ShieldAlert, ChevronRight, ChevronDown, CheckCheck, Check, CornerUpLeft } from 'lucide-react';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { WaitChip } from '../../components/dueChip';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
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
import { CARD_HEAD_TINT, CARD_TOP_BAR } from './cardAccent';
import { ACTIVITY_CATEGORY_LABEL } from './dashboardDisplay';
import { CATEGORY_ACCENT, CATEGORY_ICON, CATEGORY_PILL, CATEGORY_TILE } from './categoryLook';

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

export const ApprovalLink = memo(({ row, now, selected = false, actions }: ApprovalLinkProps) => {
  const Icon = CATEGORY_ICON[row.category];
  return (
    <div
      data-approval-key={rowKey(row)}
      className={cn('group relative flex items-center transition-colors duration-150 hover:bg-surface-hover/60', selected && 'bg-surface-hover/70 ring-2 ring-inset ring-vivid-blue/40')}
    >
      <Link
        to={row.link}
        viewTransition
        className="relative flex min-h-[4.25rem] min-w-0 flex-1 items-center gap-3 px-4 sm:px-5 py-3 outline-none transition-colors duration-150 active:bg-surface-hover focus-visible:bg-surface-hover"
      >
        <span aria-hidden="true" className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100', CATEGORY_ACCENT[row.category])} />
        <span className={cn('flex items-center justify-center size-11 rounded-xl shrink-0 text-white', CATEGORY_TILE[row.category])}>
          <Icon className="size-5" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <div className="flex flex-1 min-w-0 flex-col gap-1.5">
          <p className="line-clamp-2 text-sm font-display font-semibold text-text leading-snug">{row.title.replace(/\.(\s+·|\s*$)/, '$1')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-bold', CATEGORY_PILL[row.category])}>{ACTIVITY_CATEGORY_LABEL[row.category]}</span>
            <WaitChip since={row.waitingSince} now={now} />
            {row.meta && (
              <span className="inline-flex min-w-0 items-center gap-1.5 t-meta font-medium text-text-secondary">
                <span aria-hidden="true" className={cn('flex size-5 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold leading-none text-white', avatarColorClass(row.meta))}>{getInitials(row.meta).slice(0, 1)}</span>
                <span className="truncate">{row.meta}</span>
              </span>
            )}
          </div>
        </div>
        {!actions && (
          <span className="hidden shrink-0 items-center rounded-full border border-border bg-surface px-3 py-1 t-meta font-display font-bold text-text-secondary transition-colors group-hover:border-vivid-blue/50 group-hover:text-vivid-blue-text lg:inline-flex">Review</span>
        )}
        <ChevronRight size={16} strokeWidth={2} className={cn('shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5', actions ? 'sm:hidden' : 'lg:hidden')} aria-hidden="true" />
      </Link>
      {actions && <div className="flex shrink-0 items-center gap-1.5 pr-3 sm:pr-4">{actions}</div>}
    </div>
  );
});
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
      className={`${PANEL_CLASS} ${CARD_TOP_BAR.blue} flex h-full flex-col overflow-hidden`}>
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-border/40 ${CARD_HEAD_TINT.blue}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-vivid-blue text-white">
            <ShieldAlert className="size-5" strokeWidth={2.25} aria-hidden="true" />
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
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-vivid-blue px-2.5 t-card font-display font-extrabold tabular-nums text-white" aria-label={`${total} waiting`}>{total}</span>
          )}
          {queueHref && !nothingToShow && (
            <Link
              viewTransition
              to={queueHref}
              className="inline-flex items-center gap-0.5 h-11 sm:h-9 px-3.5 rounded-full border border-vivid-blue/40 bg-vivid-blue/8 text-sm font-display font-bold text-vivid-blue-text transition-colors hover:bg-vivid-blue/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              Review all
              <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />
            </Link>
          )}
        </div>
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
                        className="inline-flex size-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-vivid-red/40 text-vivid-red-text outline-none transition-colors duration-150 hover:bg-vivid-red/10 focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] lg:h-9 lg:w-auto lg:px-3"
                      >
                        <CornerUpLeft size={15} strokeWidth={2.25} aria-hidden="true" />
                        <span className="hidden t-meta font-display font-bold lg:inline">Send back</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => approve(row)}
                        aria-label={`Approve ${row.title}`}
                        title="Approve (A)"
                        className="inline-flex size-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-vivid-green text-on-vivid outline-none transition-colors duration-150 hover:bg-vivid-green/85 focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.97] lg:h-9 lg:w-auto lg:px-3.5"
                      >
                        <Check size={16} strokeWidth={2.75} aria-hidden="true" />
                        <span className="hidden t-meta font-display font-bold lg:inline">Approve</span>
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
          className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-display font-semibold text-vivid-blue-text outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
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
            className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-display font-semibold text-vivid-blue-text outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover"
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
