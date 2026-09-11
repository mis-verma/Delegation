import type { ReactElement } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, AlertCircle, ShieldCheck, ShieldAlert, ShieldQuestion, History, Check, Pencil, Clock, ClipboardCheck, Layers } from 'lucide-react';
import { Skeleton, StatusChip, EntityIconTile } from '../../../components';
import { useChecklistInstanceQuery, useAssignableUsersQuery } from '../hook';
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
import { formatDate, formatDateTime, instanceProgressToneClass, instanceProgressBarClass, isInstanceOverdue, isInstanceNotYetOpen } from '../checklistDisplay';
import { useAuth } from '../../../context/AuthContext';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

type ItemCardContext = { instanceId: string; canWork: boolean; isLocked: boolean; currentUserId?: string };

// Which card renders a given item — AUDIT items fan out into per-auditor submissions
// (ChecklistInstanceItemAuditCard, its own currentUserId-scoped interactivity), everything else
// keeps the original single-state card. A lookup map of render closures, not an if/else, since
// the two cards take different prop shapes and can't share one component reference directly.
const ITEM_CARD_RENDERERS: Record<ChecklistInstanceItem['itemType'], (item: ChecklistInstanceItem, ctx: ItemCardContext) => ReactElement> = {
  STANDARD: (item, ctx) => (
    <ChecklistInstanceItemCard item={item} instanceId={ctx.instanceId} canWork={ctx.canWork} isLocked={ctx.isLocked} />
  ),
  AUDIT: (item, ctx) => (
    <ChecklistInstanceItemAuditCard item={item} instanceId={ctx.instanceId} currentUserId={ctx.currentUserId} isLocked={ctx.isLocked} />
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
  const { data: instance, isPending, isError, refetch } = useChecklistInstanceQuery(instanceId);
  // Scoped to the instance's own store once it's loaded — resolves completedBy user ids to real
  // names for the Activity timeline below. Gated on `instance` so this doesn't fire an unscoped,
  // org-wide roster fetch on the first render (before instance?.storeId is known) that then gets
  // immediately superseded by the scoped one once the instance loads.
  const { data: people = [] } = useAssignableUsersQuery(undefined, instance?.storeId, undefined, !!instance);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 text-danger text-sm font-display max-w-4xl">
        <AlertCircle size={15} />
        <span className="flex-1">Failed to load checklist.</span>
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

  const total = instance.items.length;
  const done = instance.items.filter(i => i.isDone).length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  // PC has full parity with ADMIN throughout this app.
  const isAdminOrPC = user?.role === 'ADMIN' || user?.role === 'PC';
  const canWork = isAdminOrPC || (!!user && instance.assigneeIds.includes(user.id));
  const isLocked = instance.verificationStatus === 'APPROVED';
  const isComplete = total > 0 && done === total;
  const overdue = isInstanceOverdue(instance, isComplete);
  const notYetOpen = isInstanceNotYetOpen(instance);
  const nameById = new Map(people.map(p => [p.id, `${p.firstName} ${p.lastName ?? ''}`.trim() || p.email]));
  // Only show section headers when the checklist actually has any — most checklists were built
  // before this feature (or never use it) and should keep rendering as one plain flat list.
  const hasSections = instance.items.some(i => i.section);
  const timeline = instance.items
    .filter((i): i is typeof i & { completedAt: string } => i.isDone && !!i.completedAt)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Top bar — same shape as ChecklistDefinitionDetail's own nav row (plain-text back button,
          pill-styled secondary action), instead of the two bare gray text links this used to be. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-display font-medium text-text-secondary hover:text-text transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-md py-1 px-1.5"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        {isAdminOrPC && (
          <Link
            to={`/admin/scheduled-checklists/builder/${instance.definitionId}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-display font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/60 shadow-2xs transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            title="Edit this checklist's template — affects future runs, not this one"
          >
            <Pencil size={12} />
            <span>Edit template</span>
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5 sm:p-6 rounded-lg border border-border bg-surface">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <EntityIconTile icon={ClipboardCheck} tone="coral" />
            <h1 className="text-lg sm:text-xl font-display font-bold text-text tracking-tight leading-snug pt-1.5">{instance.title}</h1>
          </div>
          <span className={`shrink-0 text-xs font-display font-medium px-2.5 py-1 rounded-full bg-surface-hover ${instanceProgressToneClass(overdue, isComplete)}`}>
            Mark {progress}%
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-text-muted font-display">
            {formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)}
          </p>
          {overdue && <StatusChip status="overdue" />}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <div className="h-1.5 flex-1 bg-surface-hover rounded-full overflow-hidden border border-border/50">
            <div
              className={`h-full rounded-full transition-all duration-500 ${instanceProgressBarClass(overdue, isComplete)}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-display text-text-muted shrink-0">{done}/{total} done</span>
        </div>
      </div>

      {notYetOpen && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-muted/40 border border-border text-text-secondary text-xs font-display">
          <Clock size={16} className="shrink-0" />
          This checklist opens at {instance.opensTime} — items can't be marked done before then.
        </div>
      )}

      {instance.verificationStatus === 'PENDING' && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-primary-500/10 border border-primary-500/25 text-primary-600 dark:text-primary-300 text-xs font-display">
          <ShieldQuestion size={16} className="shrink-0" />
          Every item is checked off — awaiting PC/Admin verification.
        </div>
      )}

      {instance.verificationStatus === 'APPROVED' && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-success/10 border border-success/25 text-success text-xs font-display">
          <ShieldCheck size={16} className="shrink-0" />
          Verified{instance.verifiedAt ? ` on ${formatDateTime(instance.verifiedAt)}` : ''}.
          {instance.verificationNote ? ` "${instance.verificationNote}"` : ''}
        </div>
      )}

      {instance.verificationStatus === 'REJECTED' && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs font-display">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <span>
            Sent back for changes{instance.verificationNote ? `: "${instance.verificationNote}"` : '.'} Fix the
            flagged items and re-check everything to resubmit.
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
                {ITEM_CARD_RENDERERS[item.itemType](item, { instanceId, canWork, isLocked, currentUserId: user?.id })}
                {canWork && !isLocked && !item.isDone && item.itemType !== 'AUDIT' && (
                  <ItemRemarksField item={item} instanceId={instanceId} required={overdue} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {timeline.length > 0 && (
        <div className="flex flex-col gap-3 p-5 rounded-lg border border-border bg-surface">
          <h2 className="flex items-center gap-1.5 text-xs font-display font-bold text-text-light">
            <History size={13} /> Activity
          </h2>
          <div className="flex flex-col gap-2.5">
            {timeline.map(item => (
              <div key={item.id} className="flex items-start gap-2.5">
                <span className="flex items-center justify-center size-5 rounded-full bg-success/10 text-success shrink-0 mt-0.5">
                  <Check size={11} strokeWidth={3} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display text-text truncate">{item.label}</p>
                  <p className="text-xs font-display text-text-muted mt-0.5">
                    {formatDateTime(item.completedAt)}
                    {item.completedBy && ` · ${nameById.get(item.completedBy) ?? 'Unknown'}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
