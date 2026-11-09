import { itemFlags } from '../checklist/instance/reviewFlags';
import { isFailedPhoto, qualityFlagsOf } from '../checklist/photoQuality';
import type { EvidenceImage } from '../checklist/instance/EvidenceThumb';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';
import type { PreviewItem } from './checklistSummary';

export interface SendBackPayload {
  itemIds: string[];
  note: string;
  fixByHours?: number | null;
  photoOnlyItemIds?: string[];
}

export interface CorrectionItem {
  id: string;
  label: string;
  problems: string[];
  photos: EvidenceImage[];
  canPhotoOnly: boolean;
}

const PHOTO_PROBLEMS = new Set(['Photo not clear', 'Old photo']);

export const itemProblems = (item: ChecklistInstanceItem): string[] => {
  const flags = itemFlags(item);
  return [
    ...(flags.weakPhoto ? ['Photo not clear'] : []),
    ...(flags.notLive ? ['Not live'] : []),
    ...(flags.reusedPhoto || flags.oldPhoto ? ['Old photo'] : []),
    ...(flags.missingPhotos && !flags.notLive ? ['Missing photo'] : []),
    ...(flags.bad ? ['Answer not matching'] : []),
  ];
};

export const canRetakePhotoOnly = (item: ChecklistInstanceItem): boolean =>
  item.itemType !== 'AUDIT' && ((item.images ?? []).some((img) => (img.purpose ?? 'GENERAL') === 'GENERAL') || item.requiredImageCount > 0);

export interface PickDefaults {
  photoOnly: boolean;
  note: string;
}

export const pickDefaults = (item: Pick<CorrectionItem, 'problems' | 'canPhotoOnly'>): PickDefaults => ({
  photoOnly: item.canPhotoOnly && item.problems.some((p) => PHOTO_PROBLEMS.has(p)),
  note: item.problems.filter((p) => p !== 'Not done').slice(0, 2).join('; '),
});

export const runCorrectionItems = (items: readonly ChecklistInstanceItem[]): CorrectionItem[] =>
  [...items].sort((a, b) => a.order - b.order).map((item) => ({
    id: item.id,
    label: item.label,
    photos: (item.images ?? []).filter((img) => (img.purpose ?? 'GENERAL') === 'GENERAL'),
    canPhotoOnly: canRetakePhotoOnly(item),
    problems: itemProblems(item),
  }));

export const previewCorrectionItems = (items: readonly PreviewItem[]): CorrectionItem[] =>
  items.map((item) => {
    const photos: EvidenceImage[] = item.images.map((img) => ({
      id: img.id,
      url: img.url,
      originalFilename: img.originalFilename ?? null,
      mimeType: img.mimeType ?? 'image/jpeg',
      captureMethod: img.captureMethod ?? 'GALLERY',
      createdAt: img.createdAt ?? new Date(0).toISOString(),
      qualityFlags: img.qualityFlags ?? null,
      reviewStatus: img.reviewStatus,
      reviewReason: img.reviewReason ?? null,
    }));
    const clear = photos.filter((img) => !isFailedPhoto(img));
    const qualifying = item.requiresLivePhoto ? clear.filter((img) => img.captureMethod === 'LIVE').length : clear.length;
    const weak = photos.some((img) => isFailedPhoto(img) || qualityFlagsOf(img).length > 0);
    const notLive = !!item.requiresLivePhoto && photos.some((img) => img.captureMethod !== 'LIVE');
    return {
      id: item.id,
      label: item.label,
      photos,
      canPhotoOnly: photos.length > 0 || item.requiredImageCount > 0,
      problems: [
        ...(weak ? ['Photo not clear'] : []),
        ...(notLive ? ['Not live'] : []),
        ...(item.requiredImageCount > 0 && qualifying < item.requiredImageCount && !notLive ? ['Missing photo'] : []),
        ...(!item.isDone ? ['Not done'] : []),
      ],
    };
  });
