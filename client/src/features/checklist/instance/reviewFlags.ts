import { answerVerdict } from '../checklistCompliance';
import { hasWeakPhoto } from '../photoQuality';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

export interface ItemFlags {
  bad: boolean;
  missingPhotos: boolean;
  notLive: boolean;
  reusedPhoto: boolean;
  oldPhoto: boolean;
  weakPhoto: boolean;
  sentBack: boolean;
  waived: boolean;
  critical: boolean;
  criticalFailed: boolean;
  fixed: boolean;
  needsLook: boolean;
}

type PhotoItem = Pick<ChecklistInstanceItem, 'images' | 'requiresLivePhoto'>;

const generalPhotos = (item: Pick<ChecklistInstanceItem, 'images'>) =>
  (item.images ?? []).filter((img) => (img.purpose ?? 'GENERAL') === 'GENERAL');

export const generalPhotoCount = (item: Pick<ChecklistInstanceItem, 'images'>): number => generalPhotos(item).length;

export const photoBreakdown = (item: PhotoItem) => {
  const photos = generalPhotos(item);
  const live = photos.filter((img) => img.captureMethod === 'LIVE').length;
  const qualifying = item.requiresLivePhoto ? live : photos.length;
  return { live, gallery: photos.length - live, qualifying };
};

export const itemFlags = (item: ChecklistInstanceItem): ItemFlags => {
  const verdict = answerVerdict(item);
  const waived = !!item.waivedAt;
  const sentBack = item.sendBackCount > 0 && !waived;
  const bad = verdict === 'bad' && !sentBack;
  const photos = photoBreakdown(item);
  const missingPhotos = !item.isNotApplicable && item.requiredImageCount > 0 && photos.qualifying < item.requiredImageCount;
  const notLive = missingPhotos && item.requiresLivePhoto && photos.gallery > 0;
  const reusedPhoto = !item.isNotApplicable && (item.images ?? []).some((img) => img.reusedFromEarlier === true);
  const oldPhoto = !item.isNotApplicable && !reusedPhoto && (item.images ?? []).some((img) => img.takenBeforeRun === true);
  const weakPhoto = !item.isNotApplicable && !reusedPhoto && !oldPhoto && hasWeakPhoto(item.images);
  const critical = item.isCritical === true;
  return {
    bad,
    missingPhotos,
    notLive,
    reusedPhoto,
    oldPhoto,
    weakPhoto,
    sentBack,
    waived,
    critical,
    criticalFailed: critical && verdict === 'bad',
    fixed: sentBack && item.isDone && !item.reviewTicketId,
    needsLook: bad || missingPhotos || sentBack || reusedPhoto || oldPhoto || weakPhoto,
  };
};

export const needsLookRank = (flags: ItemFlags): number =>
  flags.criticalFailed ? 0 : flags.bad ? 1 : flags.reusedPhoto ? 2 : flags.missingPhotos ? 3 : 4;
