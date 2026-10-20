import { memo, type ReactElement } from 'react';
import { AlertTriangle, CornerUpLeft, Layers, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoticeBanner } from '../../../components';
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
import { RaiseTicketAction } from './RaiseTicketAction';
import { WaiveAction } from './WaiveAction';
import { complianceReason, countsAgainstCompliance, waiveNotice } from '../checklistCompliance';
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

export interface DetailItemRowProps {
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
  canRaiseTicket?: boolean;
  note?: string;
  onNoteChange?: (itemId: string, note: string) => void;
}

export const DetailItemRow = memo(({
  item, instanceId, canWork, isLocked, currentUserId, overdue, showHeader, sectionCount, isFirst, selecting, picked, onTogglePicked, canWaive, canRaiseTicket = false, note = '', onNoteChange,
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
        {(selecting || canRaiseTicket || item.reviewTicketId) && (
          <div className="flex flex-wrap items-center gap-2">
            {selecting && (
              <label className={`flex flex-1 basis-48 items-center gap-2.5 px-3.5 min-h-11 rounded-lg border t-meta font-display font-semibold cursor-pointer transition-colors duration-150 ${picked ? 'border-danger/40 bg-danger/10 text-danger' : 'border-border/60 bg-surface text-text-secondary hover:bg-surface-hover'}`}>
                <input
                  type="checkbox"
                  checked={picked}
                  onChange={() => onTogglePicked(item.id)}
                  className="size-4 accent-danger cursor-pointer"
                />
                {picked ? 'Sending this question back' : 'Send this question back'}
              </label>
            )}
            {(canRaiseTicket || item.reviewTicketId) && <RaiseTicketAction item={item} canRaise={canRaiseTicket} />}
          </div>
        )}
        {selecting && picked && onNoteChange && (
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => onNoteChange(item.id, e.target.value)}
            placeholder="Note for this question (optional)"
            aria-label={`Note for: ${item.label}`}
            className="w-full h-11 sm:h-9 px-3 rounded-lg border border-border bg-surface text-sm font-display text-text placeholder:text-text-light outline-none hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30"
          />
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
