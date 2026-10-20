import { answerVerdict } from '../checklistCompliance';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

export interface ItemFlags {
  bad: boolean;
  missingPhotos: boolean;
  sentBack: boolean;
  waived: boolean;
  critical: boolean;
  criticalFailed: boolean;
  fixed: boolean;
  needsLook: boolean;
}

export const generalPhotoCount = (item: Pick<ChecklistInstanceItem, 'images'>): number =>
  (item.images ?? []).filter((img) => (img.purpose ?? 'GENERAL') === 'GENERAL').length;

export const itemFlags = (item: ChecklistInstanceItem): ItemFlags => {
  const verdict = answerVerdict(item);
  const waived = !!item.waivedAt;
  const sentBack = item.sendBackCount > 0 && !waived;
  const bad = verdict === 'bad' && !sentBack;
  const missingPhotos = !item.isNotApplicable && item.requiredImageCount > 0 && generalPhotoCount(item) < item.requiredImageCount;
  const critical = item.isCritical === true;
  return {
    bad,
    missingPhotos,
    sentBack,
    waived,
    critical,
    criticalFailed: critical && verdict === 'bad',
    fixed: sentBack && item.isDone && !item.reviewTicketId,
    needsLook: bad || missingPhotos || sentBack,
  };
};

export const needsLookRank = (flags: ItemFlags): number =>
  flags.criticalFailed ? 0 : flags.bad ? 1 : flags.missingPhotos ? 2 : 3;
