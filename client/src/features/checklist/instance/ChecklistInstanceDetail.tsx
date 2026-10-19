import { memo, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { haptic } from '../../../lib/haptics';
import { useRefreshOnNewDay } from '../useRefreshOnNewDay';
import { useParams, useNavigate } from 'react-router';
import { ArrowDown, ArrowLeft, CheckCheck, ShieldAlert, ShieldCheck, ShieldQuestion, CornerUpLeft, AlertTriangle, Pencil, Clock, Layers, ClipboardX } from 'lucide-react';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useMyExtraWorkingDaysQuery } from '../../admin/holidays/hook';
import { cn } from '@/lib/utils';
import {
  Button, ChecklistProgressBar, IconChip, InlineError, NoticeBanner, PANEL_CLASS, Skeleton, StatusChip, VerificationNoteBanner,
} from '../../../components';
import { useChecklistInstanceQuery } from '../hook';
import { ApiError } from '../../../api/http';
import { ChecklistInstanceItemCard } from './ChecklistInstanceItemCard';
import { ChecklistInstanceItemAuditCard } from './ChecklistInstanceItemAuditCard';
import { ChecklistInstanceItemNumberEntryCard } from './ChecklistInstanceItemNumberEntryCard';
import { ChecklistInstanceItemRatingCard } from './ChecklistInstanceItemRatingCard';
import { ChecklistInstanceItemBooleanCard } from './ChecklistInstanceItemBooleanCard';
import { ChecklistInstanceItemChoiceCard } from './ChecklistInstanceItemChoiceCard';
import { ChecklistInstanceItemTextCard } from './ChecklistInstanceItemTextCard';
import { ChecklistInstanceItemDateTimeCard } from './ChecklistInstanceItemDateTimeCard';
import { ChecklistInstanceItemGpsCard } from './ChecklistInstanceItemGpsCard';
import { ChecklistInstanceItemSignatureCard } from './ChecklistInstanceItemSignatureCard';
import { ChecklistInstanceItemDualSignatureCard } from './ChecklistInstanceItemDualSignatureCard';
import { ChecklistInstanceItemQrScanCard } from './ChecklistInstanceItemQrScanCard';
import { ChecklistInstanceItemCashTallyCard } from './ChecklistInstanceItemCashTallyCard';
import { ItemRemarksField } from './ItemRemarksField';
import { NotApplicableItemCard } from './NotApplicableItemCard';
import { ChecklistReviewBar } from './ChecklistReviewBar';
import { ChecklistSubmitBar } from './ChecklistSubmitBar';
import { complianceReason, countsAgainstCompliance, waiveNotice } from '../checklistCompliance';
import { WaiveAction } from './WaiveAction';
import {
  complianceToneClass, describeInstanceEnd, formatDateTime, getInstanceView, instanceDeadline, instanceProgressToneClass, isInstanceEnded, isInstanceNotYetOpen,
  RECURRENCE_LABEL, formatPeriodSpan } from '../checklistDisplay';
import { useNow } from '../../../lib/useNow';
import { useAuth } from '../../../context/AuthContext';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

type ItemCardContext = { instanceId: string; canWork: boolean; isLocked: boolean; currentUserId?: string };

const ITEM_CARD_RENDERERS: Record<ChecklistInstanceItem['itemType'], (item: ChecklistInstanceItem, ctx: ItemCardContext) => ReactElement> = {
  STANDARD: (item, ctx) => (
    <ChecklistInstanceItemCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  AUDIT: (item, ctx) => (
    <ChecklistInstanceItemAuditCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} currentUserId={ctx.currentUserId} isLocked={ctx.isLocked} />
  ),
  NUMBER_ENTRY: (item, ctx) => (
    <ChecklistInstanceItemNumberEntryCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  RATING: (item, ctx) => (
    <ChecklistInstanceItemRatingCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  YES_NO: (item, ctx) => (
    <ChecklistInstanceItemBooleanCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  PASS_FAIL: (item, ctx) => (
    <ChecklistInstanceItemBooleanCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  MULTIPLE_CHOICE: (item, ctx) => (
    <ChecklistInstanceItemChoiceCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  DROPDOWN: (item, ctx) => (
    <ChecklistInstanceItemChoiceCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  TEXT_BOX: (item, ctx) => (
    <ChecklistInstanceItemTextCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  DATE_TIME: (item, ctx) => (
    <ChecklistInstanceItemDateTimeCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  GPS: (item, ctx) => (
    <ChecklistInstanceItemGpsCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  SIGNATURE: (item, ctx) => (
    <ChecklistInstanceItemSignatureCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  DUAL_SIGNATURE: (item, ctx) => (
    <ChecklistInstanceItemDualSignatureCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  QR_SCAN: (item, ctx) => (
    <ChecklistInstanceItemQrScanCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  CASH_TALLY: (item, ctx) => (
    <ChecklistInstanceItemCashTallyCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  VIDEO_UPLOAD: (item, ctx) => (
    <ChecklistInstanceItemCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
};

interface DetailItemRowProps {
  item: ChecklistInstanceItem;
  instanceId: string;
  canWork: boolean;
  isLocked: boolean;
  currentUserId: string | undefined;
  overdue: boolean;
  showHeader: boolean;
  sectionCount?: { done: number; total: number };
  isFirst: boolean;
  selecting: boolean;
  picked: boolean;
  onTogglePicked: (itemId: string) => void;
  canWaive: boolean;
}

const DetailItemRow = memo(({
  item, instanceId, canWork, isLocked, currentUserId, overdue, showHeader, sectionCount, isFirst, selecting, picked, onTogglePicked, canWaive,
}: DetailItemRowProps) => {
  const canEdit = canWork && !isLocked;
  const reason = complianceReason(item);
  const waived = waiveNotice(item);
  return (
    <>
      {showHeader && (
        <div className={`flex items-center gap-2 ${isFirst ? '' : 'pt-3'}`}>
          <Layers size={14} className="text-text-muted shrink-0" aria-hidden />
          <h2 className="t-card font-display font-bold text-text">
            {item.section ?? 'Ungrouped'}
          </h2>
          {sectionCount && (
            <span className={cn('shrink-0 t-meta font-semibold tabular-nums', sectionCount.done === sectionCount.total ? 'text-success' : 'text-text-muted')}>
              {sectionCount.done}/{sectionCount.total}
            </span>
          )}
          <div className="h-px flex-1 bg-border/60" />
        </div>
      )}
      <div id={`item-${item.id}`} className="flex flex-col gap-1.5 scroll-mt-28">
        {selecting && (
          <label className={`flex items-center gap-2.5 px-3.5 min-h-11 rounded-lg border text-xs font-display font-semibold cursor-pointer transition-colors duration-150 ${picked ? 'border-danger/40 bg-danger/10 text-danger' : 'border-border/60 bg-surface text-text-secondary hover:bg-surface-hover'}`}>
            <input
              type="checkbox"
              checked={picked}
              onChange={() => onTogglePicked(item.id)}
              className="size-4 accent-danger cursor-pointer"
            />
            Send this question back
          </label>
        )}
        {reason && (
          <NoticeBanner tone="warning" icon={AlertTriangle} className="items-center p-2.5 px-3.5 font-medium">
            {reason}
          </NoticeBanner>
        )}
        {waived && (
          <NoticeBanner tone="info" icon={ShieldCheck} className="items-center p-2.5 px-3.5 font-medium">
            {waived}
          </NoticeBanner>
        )}
        {!item.isDone && item.sendBackNote && (
          <NoticeBanner tone="danger" icon={CornerUpLeft} className="p-2.5 px-3.5">
            Sent back: {item.sendBackNote}
          </NoticeBanner>
        )}
        {canWaive && (item.waivedAt || countsAgainstCompliance(item)) && (
          <div className="flex justify-end">
            <WaiveAction instanceId={instanceId} item={item} />
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface [&>*:first-child]:rounded-none [&>*:first-child]:border-0">
          {item.isNotApplicable ? (
            <NotApplicableItemCard item={item} instanceId={instanceId} canEdit={canEdit} />
          ) : (
            ITEM_CARD_RENDERERS[item.itemType](item, { instanceId, canWork, isLocked, currentUserId })
          )}
          <div className="border-t border-border/50 px-3 py-2 sm:px-4 empty:hidden">
            <ItemRemarksField item={item} instanceId={instanceId} required={overdue} canEdit={canEdit} />
          </div>
        </div>
      </div>
    </>
  );
});
DetailItemRow.displayName = 'DetailItemRow';

const DetailSkeleton = () => (
  <div className="flex flex-col gap-6 w-full" aria-hidden>
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-8 pointer-coarse:h-11 w-20 rounded-md" />
    </div>
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 sm:p-5')}>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    </div>
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 min-h-24')}>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export const ChecklistInstanceDetail = () => {
  const { instanceId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  useRefreshOnNewDay();
  const now = useNow();
  const { data: instance, isPending, isError, error, refetch } = useChecklistInstanceQuery(instanceId);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const togglePicked = useCallback((itemId: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    }), []);
  const startSelecting = useCallback(() => setSelecting(true), []);
  const stopSelecting = useCallback(() => { setSelecting(false); setPicked(new Set()); }, []);
  const selectedIds = useMemo(() => [...picked], [picked]);
  const sentBackId = instance?.verificationStatus === 'REJECTED' && user?.role !== 'ADMIN' && user?.role !== 'PC' ? instance.id : null;
  useEffect(() => { if (sentBackId) haptic('warning'); }, [sentBackId]);
  const { data: myExtraDays } = useMyExtraWorkingDaysQuery();
  const [show, setShow] = useState<'all' | 'left'>('all');
  const goBackAfterDecision = () => {
    const hasHistory = typeof window !== 'undefined' && typeof window.history.state?.idx === 'number' && window.history.state.idx > 0;
    if (hasHistory) navigate(-1);
    else navigate(user?.role === 'ADMIN' || user?.role === 'PC' ? '/verify' : '/checklists/approvals', { replace: true });
  };

  if (isPending) return <DetailSkeleton />;

  const isDeleted = error instanceof ApiError && error.status === 404;
  if (isDeleted) {
    return (
      <div className="w-full py-16 flex flex-col items-center gap-3 text-center">
        <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted">
          <ClipboardX className="size-6" strokeWidth={2.25} aria-hidden />
        </span>
        <h1 className="text-base font-display font-bold text-text">This checklist run is no longer available</h1>
        <p className="text-sm font-display text-text-muted max-w-sm">
          It may have been part of a checklist that's since been deleted.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/checklists')}>
          <ArrowLeft size={13} aria-hidden />
          Back to My Checklists
        </Button>
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="w-full">
        <InlineError message="We couldn't load this checklist. Check your connection and try again." onRetry={() => refetch()} />
      </div>
    );
  }

  const { done, total, progress, isComplete, overdue, chipStatus, compliance, scored, good, verification, doneLate } = getInstanceView(instance);
  const isAdminOrPC = user?.role === 'ADMIN' || user?.role === 'PC';
  const isMissed = instance.isMissed === true || isInstanceEnded(instance, now);
  const closedWhen = describeInstanceEnd(instance.endedAt ? new Date(instance.endedAt).getTime() : instanceDeadline(instance));
  const canWork = isAdminOrPC || (!!user && instance.assigneeIds.includes(user.id) && !isMissed);
  const isLocked = instance.verificationStatus === 'APPROVED';
  const canWaive = !!user && (isAdminOrPC || ((user.role === 'MANAGER' || user.role === 'SENIOR') && (instance.verificationStatus === 'PENDING_APPROVAL' || instance.verificationStatus === 'REJECTED'))) && !instance.assigneeIds.includes(user.id);
  const canReview =
    instance.verificationStatus === 'PENDING_APPROVAL' &&
    !!user && (isAdminOrPC || user.role === 'MANAGER' || user.role === 'SENIOR' || instance.reviewerIds.includes(user.id));
  const notYetOpen = isInstanceNotYetOpen(instance);
  const canSubmit =
    canWork && isComplete && !notYetOpen &&
    (instance.verificationStatus === 'NOT_SUBMITTED' || instance.verificationStatus === 'REJECTED');
  const hasSections = instance.items.some(i => i.section);
  const overtime = (myExtraDays ?? []).find((d) => d.date === instance.periodStart.slice(0, 10));
  const answered = (i: (typeof instance.items)[number]) => i.isDone || i.isNotApplicable;
  const left = Math.max(0, total - done);
  const shownItems = show === 'left' ? instance.items.filter((i) => !answered(i)) : instance.items;
  const sectionCounts = new Map<string, { done: number; total: number }>();
  for (const i of instance.items) {
    const key = i.section ?? '';
    const c = sectionCounts.get(key) ?? { done: 0, total: 0 };
    c.total += 1;
    if (answered(i)) c.done += 1;
    sectionCounts.set(key, c);
  }
  const goToNext = () => {
    const next = instance.items.find((i) => !answered(i));
    if (!next) return;
    if (show === 'left' && !shownItems.includes(next)) setShow('all');
    requestAnimationFrame(() => document.getElementById(`item-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const verificationNote = instance.verificationNote;
  const showBanners =
    isMissed ||
    notYetOpen ||
    (instance.verificationStatus === 'PENDING_APPROVAL' && !canReview) ||
    (instance.verificationStatus === 'APPROVED' && !!verificationNote) ||
    instance.verificationStatus === 'REJECTED';

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="max-md:hidden" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/checklists', { replace: true }))} aria-label="Back">
          <ArrowLeft size={15} aria-hidden />
          Back
        </Button>

        {isAdminOrPC && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/scheduled-checklists/builder/${instance.definitionId}`)}
            title="Edit this checklist's template. Changes apply to future runs, not this one."
          >
            <Pencil size={13} aria-hidden />
            Edit template
          </Button>
        )}
      </div>

      <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 sm:p-5')}>
        <div className="flex flex-col gap-1">
          <h1 className="t-title font-display font-semibold text-text tracking-tight leading-snug">{instance.title.replace(/\.\s*$/, '')}</h1>
          <p className="text-xs font-medium text-text-muted">
            {RECURRENCE_LABEL[instance.recurrence]} · {formatPeriodSpan(instance)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusChip status={chipStatus} showLabelOnMobile />
          {doneLate && <IconChip icon={Clock} tone="bg-warning" label="Done late" />}
          {overtime && <IconChip icon={Clock} tone="bg-warning" label={`Overtime: ${overtime.reason}`} />}
          {(isComplete || instance.verificationStatus !== 'NOT_SUBMITTED') && (
            <IconChip
              icon={verification.icon}
              tone={verification.tone}
              label={verification.label}
            />
          )}
          {instance.submittedAt && instance.verificationStatus !== 'NOT_SUBMITTED' && instance.verificationStatus !== 'REJECTED' && (
            <span className="text-xs font-medium text-text-muted">
              Submitted {formatDateTime(instance.submittedAt)}{instance.submittedByName ? ` by ${instance.submittedByName}` : ''}
            </span>
          )}
          {isLocked && instance.verifiedAt && (
            <span className="text-xs font-medium text-text-muted">on {formatDateTime(instance.verifiedAt)}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          {compliance !== null && (
            <div className="flex items-baseline justify-between gap-2 pb-1">
              <span className="text-xs font-medium text-text-muted">Compliance</span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className={`text-lg font-display font-bold leading-none ${complianceToneClass(compliance)}`}>{compliance}%</span>
                <span className="text-xs font-semibold text-text">{good} of {scored} answered well</span>
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-text-muted">Completion</span>
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className={`text-lg font-display font-bold leading-none ${instanceProgressToneClass(overdue, isComplete)}`}>{progress}%</span>
              <span className="text-xs font-semibold text-text">{done} of {total} done</span>
            </span>
          </div>
          <ChecklistProgressBar done={done} total={total} tone={overdue ? 'danger' : 'auto'} bare />
        </div>
      </div>

      {showBanners && (
        <div className="flex flex-col gap-3">
          {isMissed && (
            <NoticeBanner tone="warning" icon={Clock}>
              {isAdminOrPC ? (
                `This checklist closed at ${closedWhen} and counts as missed. You can still edit it as an admin.`
              ) : user && instance.assigneeIds.includes(user.id) ? (
                <div className="flex flex-col items-start gap-2">
                  <p>This checklist closed at {closedWhen}. It can't be filled in any more. Today's checklist is in My Checklists.</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/checklists')}>
                    Go to My Checklists
                  </Button>
                </div>
              ) : (
                `This checklist closed at ${closedWhen} and counts as missed. The people it was assigned to can no longer fill it in.`
              )}
            </NoticeBanner>
          )}

          {notYetOpen && (
            <NoticeBanner tone="neutral" icon={Clock}>
              This checklist opens at {instance.opensTime}. Items can't be ticked off before then.
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'PENDING_APPROVAL' && !canReview && (
            <NoticeBanner tone="info" icon={ShieldQuestion}>
              Submitted{instance.submittedByName ? ` by ${instance.submittedByName}` : ''}{instance.submittedAt ? ` on ${formatDateTime(instance.submittedAt)}` : ''}. Waiting for approval.
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'APPROVED' && (
            <VerificationNoteBanner note={verificationNote} approved verifiedBy={instance.verifiedBy} />
          )}

          {instance.verificationStatus === 'REJECTED' && (
            verificationNote ? (
              <>
                <VerificationNoteBanner note={verificationNote} approved={false} />
                <NoticeBanner tone="warning" icon={CornerUpLeft}>
                  Fix what's flagged, then submit it again.
                </NoticeBanner>
              </>
            ) : (
              <NoticeBanner tone="danger" icon={ShieldAlert}>
                Sent back for changes. Fix what's flagged, then submit it again.
              </NoticeBanner>
            )
          )}
        </div>
      )}

      {canWork && !isLocked && total > 0 && (
        <div className="sticky top-0 z-20 -mt-3">
          <div className={cn(PANEL_CLASS, 'flex flex-col gap-2 bg-surface px-3 py-2.5 sm:px-4')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-card font-display font-semibold text-text tabular-nums">
                {left === 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-success"><CheckCheck className="size-4" aria-hidden /> All {total} done{canSubmit ? '. Submit it below.' : ''}</span>
                ) : (
                  <>
                    <span className="text-success">{done} done</span>
                    <span className="text-text-light"> · </span>
                    <span className={overdue ? 'text-danger' : 'text-text'}>{left} left</span>
                    <span className="t-meta font-medium text-text-muted"> of {total}</span>
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                {left > 0 && (
                  <Button variant="outline" size="sm" onClick={goToNext}>
                    Next question
                    <ArrowDown size={14} aria-hidden />
                  </Button>
                )}
                <PeriodTabControl value={show} options={['all', 'left'] as const} labels={{ all: 'All', left: `Left ${left}` }} onChange={setShow} />
              </div>
            </div>
            <ChecklistProgressBar done={done} total={total} tone={overdue ? 'danger' : 'auto'} bare />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {show === 'left' && shownItems.length === 0 && (
          <div className={cn(PANEL_CLASS, 'flex items-center gap-3 p-4')}>
            <CheckCheck className="size-5 text-success shrink-0" aria-hidden />
            <p className="t-card font-display font-semibold text-text">Every question is answered.{canSubmit ? ' Submit it below.' : ''}</p>
          </div>
        )}
        {shownItems.map((item, idx) => (
          <DetailItemRow
            key={item.id}
            item={item}
            instanceId={instanceId}
            canWork={canWork}
            isLocked={isLocked}
            currentUserId={user?.id}
            overdue={overdue}
            showHeader={hasSections && (idx === 0 || shownItems[idx - 1].section !== item.section)}
            sectionCount={hasSections ? sectionCounts.get(item.section ?? '') : undefined}
            isFirst={idx === 0}
            selecting={selecting}
            picked={picked.has(item.id)}
            onTogglePicked={togglePicked}
            canWaive={canWaive}
          />
        ))}
      </div>

      {canSubmit && (
        <ChecklistSubmitBar instanceId={instanceId} total={total} resubmit={instance.verificationStatus === 'REJECTED'} />
      )}

      {canReview && (
        <ChecklistReviewBar
          instanceId={instanceId}
          selecting={selecting}
          selectedCount={picked.size}
          selectedIds={selectedIds}
          onStartSelecting={startSelecting}
          onStopSelecting={stopSelecting}
          onSent={stopSelecting}
          onDecided={goBackAfterDecision}
        />
      )}
    </div>
  );
};
