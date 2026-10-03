import { useState, type ReactElement } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, AlertCircle, ShieldCheck, ShieldAlert, ShieldQuestion, CornerUpLeft, AlertTriangle, Pencil, Clock, Layers, ClipboardX } from 'lucide-react';
import { Skeleton, StatusChip, IconChip } from '../../../components';
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
import { runScores, answerVerdict } from '../checklistCompliance';
import { complianceToneClass } from '../checklistDisplay';
import { formatDate, formatDateTime, instanceProgressBarClass, instanceProgressToneClass, isInstanceOverdue, isInstanceNotYetOpen, RECURRENCE_LABEL, VERIFICATION_STATUS_LABEL, VERIFICATION_CHIP } from '../checklistDisplay';
import { useAuth } from '../../../context/AuthContext';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

type ItemCardContext = { instanceId: string; canWork: boolean; isLocked: boolean; currentUserId?: string };

// Which card renders a given item — AUDIT items fan out into one row per person being audited,
// everything else keeps the original single-state card. A lookup map of render closures, not an
// if/else, since the two cards take different prop shapes and can't share one component reference
// directly.
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
  // VIDEO_UPLOAD reuses the STANDARD photo-evidence card — same upload pipeline, the card itself
  // renders a <video> instead of an <img> and swaps the accept/button copy based on itemType.
  VIDEO_UPLOAD: (item, ctx) => (
    <ChecklistInstanceItemCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
};

// Shared between a user's own "My Checklists" link and the admin oversight link from
// ChecklistDefinitionDetail — the server authorizes both (ADMIN or an assignee of the instance).
export const ChecklistInstanceDetail = () => {
  const { instanceId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: instance, isPending, isError, error, refetch } = useChecklistInstanceQuery(instanceId);
  // Reviewer's send-back picking: which questions are ticked while the review bar is in pick mode.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const togglePicked = (itemId: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // Same reasoning as ChecklistDefinitionDetail/ChecklistBuilder's own "was deleted" state — an
  // old notification or bookmark pointing at an instance id that's gone (or was never real) hits
  // a 404 every retry, so show what actually happened instead of a "check your connection" banner
  // whose Retry can never succeed.
  const isDeleted = error instanceof ApiError && error.status === 404;
  if (isDeleted) {
    return (
      <div className="w-full max-w-4xl mx-auto py-16 flex flex-col items-center gap-3 text-center">
        <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted">
          <ClipboardX className="size-6" strokeWidth={2.25} />
        </span>
        <h1 className="text-base font-display font-bold text-text">This checklist run is no longer available</h1>
        <p className="text-sm font-display text-text-muted max-w-sm">
          It may have been part of a checklist that's since been deleted.
        </p>
        <Link
          to="/checklists"
          className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-display font-semibold border border-border bg-surface hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={13} />
          Back to My Checklists
        </Link>
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 text-danger text-sm font-display max-w-4xl">
        <AlertCircle size={15} />
        <span className="flex-1">We couldn't load this checklist.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          Retry
        </button>
      </div>
    );
  }

  const rawTotal = instance.items.length;
  const isComplete = rawTotal > 0 && instance.items.every(i => i.isDone);
  // Completion leaves "not applicable" questions out of both sides; compliance scores only the
  // answered questions that have a good-answer rule.
  const { done, total, completion: progress, compliance, scored, good } = runScores(instance.items);
  // PC has full parity with ADMIN throughout this app.
  const isAdminOrPC = user?.role === 'ADMIN' || user?.role === 'PC';
  const canWork = isAdminOrPC || (!!user && instance.assigneeIds.includes(user.id));
  const isLocked = instance.verificationStatus === 'APPROVED';
  // Same people who can approve; the server still checks the department for a MANAGER/SENIOR.
  const canReview =
    instance.verificationStatus === 'PENDING_APPROVAL' &&
    !!user && (isAdminOrPC || user.role === 'MANAGER' || user.role === 'SENIOR' || instance.reviewerIds.includes(user.id));
  const overdue = isInstanceOverdue(instance, isComplete);
  const notYetOpen = isInstanceNotYetOpen(instance);
  // Only show section headers when the checklist actually has any — most checklists were built
  // before this feature (or never use it) and should keep rendering as one plain flat list.
  const hasSections = instance.items.some(i => i.section);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Back on the left, Edit template (admins) on the right. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 -ml-2 rounded-full text-sm font-display font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
        >
          <ArrowLeft size={17} />
          <span>Back</span>
        </button>

        {isAdminOrPC && (
          <Link
            to={`/admin/scheduled-checklists/builder/${instance.definitionId}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-display font-semibold text-text-secondary border border-border/60 dark:border-white/[0.08] bg-surface hover:border-primary-400 hover:text-text transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            title="Edit this checklist's template. Changes apply to future runs, not this one."
          >
            <Pencil size={13} />
            <span>Edit template</span>
          </Link>
        )}
      </div>

      {/* Header: title, how often and the period, status + approval chips, then progress. Same
          chip language as the list cards; the gold tile and the "% done" badge are gone. */}
      <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg sm:text-xl font-display font-semibold text-text tracking-tight leading-snug">{instance.title}</h1>
          <p className="text-xs font-medium text-text-muted">
            {RECURRENCE_LABEL[instance.recurrence]} · {formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusChip status={isComplete ? 'completed' : overdue ? 'overdue' : 'due'} />
          {(isComplete || instance.verificationStatus !== 'NOT_SUBMITTED') && (
            <IconChip
              icon={VERIFICATION_CHIP[instance.verificationStatus].icon}
              tone={VERIFICATION_CHIP[instance.verificationStatus].tone}
              label={VERIFICATION_STATUS_LABEL[instance.verificationStatus]}
            />
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
          <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${instanceProgressBarClass(overdue, isComplete)}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {notYetOpen && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-surface-hover/60 border border-border/60 text-text-secondary text-xs font-display">
          <Clock size={16} className="shrink-0" />
          This checklist opens at {instance.opensTime}. Items can't be ticked off before then.
        </div>
      )}

      {instance.verificationStatus === 'PENDING_APPROVAL' && !canReview && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-primary-500/10 border border-primary-500/25 text-primary-600 dark:text-primary-300 text-xs font-display">
          <ShieldQuestion size={16} className="shrink-0" />
          Everything's ticked off. Waiting for approval.
        </div>
      )}

      {instance.verificationStatus === 'APPROVED' && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-success/10 border border-success/25 text-success text-xs font-display">
          <ShieldCheck size={16} className="shrink-0" />
          Verified{instance.verifiedAt ? ` on ${formatDateTime(instance.verifiedAt)}` : ''}.
          {instance.verificationNote ? ` "${instance.verificationNote}"` : ''}
        </div>
      )}

      {instance.verificationStatus === 'REJECTED' && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-danger/10 border border-danger/25 text-danger text-xs font-display">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <span>
            Sent back for changes{instance.verificationNote ? `: "${instance.verificationNote}"` : '.'} Fix
            what's flagged and check it off again to resubmit.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {instance.items.map((item, idx) => {
          const showHeader = hasSections && (idx === 0 || instance.items[idx - 1].section !== item.section);
          return (
            <div key={item.id} className="contents">
              {showHeader && (
                <div className={`flex items-center gap-2 ${idx === 0 ? '' : 'pt-2'}`}>
                  <Layers size={12} className="text-text-light shrink-0" />
                  <h3 className="text-xs font-display font-bold text-text-secondary whitespace-nowrap">
                    {item.section ?? 'Ungrouped'}
                  </h3>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {selecting && (
                  <label className={`flex items-center gap-2.5 px-3.5 min-h-11 rounded-lg border text-xs font-display font-semibold cursor-pointer transition-colors duration-150 ${picked.has(item.id) ? 'border-danger/40 bg-danger/10 text-danger' : 'border-border/60 bg-surface text-text-secondary hover:bg-surface-hover'}`}>
                    <input
                      type="checkbox"
                      checked={picked.has(item.id)}
                      onChange={() => togglePicked(item.id)}
                      className="size-4 accent-danger cursor-pointer"
                    />
                    Send this question back
                  </label>
                )}
                {answerVerdict(item) === 'bad' && (
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-warning/10 border border-warning/25 text-warning text-xs font-display font-medium">
                    <AlertTriangle size={13} className="shrink-0" />
                    Not an acceptable answer
                  </div>
                )}
                {!item.isDone && item.sendBackNote && (
                  <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs font-display">
                    <CornerUpLeft size={13} className="shrink-0 mt-0.5" />
                    <span>Sent back: {item.sendBackNote}</span>
                  </div>
                )}
                {item.isNotApplicable ? (
                  <NotApplicableItemCard item={item} instanceId={instanceId} canEdit={canWork && !isLocked} />
                ) : (
                  ITEM_CARD_RENDERERS[item.itemType](item, { instanceId, canWork, isLocked, currentUserId: user?.id })
                )}
                {/* Shown for done items too, and read-only for reviewers: a remark used to vanish
                    the moment its item was ticked, so nobody reviewing ever saw it. Audit
                    questions get the same Add remark / Not applicable row as every other type. */}
                <ItemRemarksField item={item} instanceId={instanceId} required={overdue} canEdit={canWork && !isLocked} />
              </div>
            </div>
          );
        })}
      </div>

      {canReview && (
        <ChecklistReviewBar
          instanceId={instanceId}
          selecting={selecting}
          selectedCount={picked.size}
          selectedIds={[...picked]}
          onStartSelecting={() => setSelecting(true)}
          onStopSelecting={stopSelecting}
          onSent={stopSelecting}
        />
      )}
    </div>
  );
};
