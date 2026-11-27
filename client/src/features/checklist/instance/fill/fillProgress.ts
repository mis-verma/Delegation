import type { ChecklistInstanceItem } from '../../../../api/checklistInstances';
import { itemFlags } from '../reviewFlags';
import { passingPhotos } from '../../photoQuality';

export interface FillProgress {
  done: number;
  total: number;
  left: number;
  overdue: boolean;
  people: { done: number; total: number } | null;
  /** Questions answered but still owing a mandatory photo. */
  photosMissing: PhotosMissing;
}

export interface PhotosMissing {
  count: number;
  /** The first one in order, so the badge has somewhere to send the reader. */
  firstId: string | null;
}

/**
 * Whether a saved Yes/No (or Pass/Fail) answer still owes the photo its own rule required.
 *
 * A photo rule on No also binds Yes, so a person can't dodge it by picking the answer nobody
 * configured a rule for. Mirrors the server's conditionalPhotoOwed check.
 */
const conditionalPhotoOwed = (item: ChecklistInstanceItem): boolean => {
  if (item.isNotApplicable) return false;
  if (item.itemType !== 'YES_NO' && item.itemType !== 'PASS_FAIL') return false;
  const answer = item.booleanAnswer;
  if (answer !== 'YES' && answer !== 'NO') return false;
  const actions = answer === 'YES' ? item.yesActions : item.noActions;
  const photoRequiredAnyway = answer === 'YES' && item.noActions.includes('REQUIRE_PHOTO');
  if (!actions.includes('REQUIRE_PHOTO') && !photoRequiredAnyway) return false;
  const images = (item.images ?? []).filter((img) => img.purpose === `CONDITIONAL_${answer}`);
  const clear = passingPhotos(images);
  const qualifying = item.requiresLivePhoto ? clear.filter((img) => img.captureMethod === 'LIVE').length : clear.length;
  return qualifying < 1;
};

/**
 * The questions still owing a mandatory photo.
 *
 * An answer no longer waits for its photo, so someone can say yes all the way down and come
 * back to the camera. This is what keeps that honest: it feeds the badge and it holds Submit
 * shut. One pass over the run, covering both an unconditional required photo (itemFlags) and a
 * photo a Yes/No rule asked for (conditionalPhotoOwed).
 */
export const photosMissingOf = (items: readonly ChecklistInstanceItem[]): PhotosMissing => {
  let count = 0;
  let firstId: string | null = null;
  for (const item of items) {
    if (!item.isDone) continue;
    const flags = itemFlags(item);
    if (flags.waived) continue;
    if (!flags.missingPhotos && !conditionalPhotoOwed(item)) continue;
    count += 1;
    if (firstId === null) firstId = item.id;
  }
  return { count, firstId };
};

export const auditPeopleProgress = (items: ChecklistInstanceItem[]): FillProgress['people'] => {
  const audits = items.filter((i) => i.itemType === 'AUDIT' && !i.isNotApplicable);
  if (!audits.length) return null;
  let done = 0;
  let total = 0;
  for (const item of audits) {
    for (const s of item.submissions) {
      total += 1;
      if (s.isDone || s.isNotApplicable) done += 1;
    }
  }
  return total > 0 ? { done, total } : null;
};

export interface SectionInfo {
  key: string;
  label: string;
  done: number;
  total: number;
}

/**
 * A section belongs to its floor, so two floors can both have Washrooms without the two
 * collapsing into one group. The key is opaque; only its uniqueness matters.
 */
export const sectionKeyOf = (item: Pick<ChecklistInstanceItem, 'floor' | 'section'>) =>
  `${item.floor ?? ''}\u0000${item.section ?? ''}`;

export const sectionLabelOf = (item: Pick<ChecklistInstanceItem, 'floor' | 'section'>): string => {
  const section = item.section ?? 'Other questions';
  return item.floor ? `${item.floor} · ${section}` : section;
};

export const sectionsOf = (items: ChecklistInstanceItem[], answered: (i: ChecklistInstanceItem) => boolean): SectionInfo[] => {
  const byKey = new Map<string, SectionInfo>();
  for (const item of items) {
    const key = sectionKeyOf(item);
    const info = byKey.get(key) ?? { key, label: sectionLabelOf(item), done: 0, total: 0 };
    info.total += 1;
    if (answered(item)) info.done += 1;
    byKey.set(key, info);
  }
  return [...byKey.values()];
};
