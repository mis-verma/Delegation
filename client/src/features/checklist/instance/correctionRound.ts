import { createContext, useContext } from 'react';
import type { ChecklistInstance, ChecklistInstanceItem } from '../../../api/checklistInstances';

export const CorrectionRoundContext = createContext<number | null>(null);

export const sentBackAtOf = (instance: Pick<ChecklistInstance, 'verificationStatus' | 'sentBackAt'>): number | null => {
  if (instance.verificationStatus !== 'REJECTED' || !instance.sentBackAt) return null;
  const at = Date.parse(instance.sentBackAt);
  return Number.isFinite(at) ? at : null;
};

export const useRoundStart = (item: Pick<ChecklistInstanceItem, 'sendBackNote'>): number | null => {
  const sentBackAt = useContext(CorrectionRoundContext);
  return item.sendBackNote && sentBackAt !== null ? sentBackAt : null;
};

export const isEarlierPhoto = (image: { createdAt: string }, roundStart: number | null): boolean =>
  roundStart !== null && Date.parse(image.createdAt) <= roundStart;

export const photosInRound = <T extends { createdAt: string }>(images: readonly T[], roundStart: number | null): T[] =>
  roundStart === null ? [...images] : images.filter((image) => !isEarlierPhoto(image, roundStart));

export const isInCorrectionRound = (item: Pick<ChecklistInstanceItem, 'isDone' | 'sendBackNote' | 'sendBackCount' | 'completedAt'>, sentBackAt: number | null): boolean => {
  if (sentBackAt === null) return false;
  if (!item.isDone) return !!item.sendBackNote;
  return item.sendBackCount > 0 && !!item.completedAt && Date.parse(item.completedAt) >= sentBackAt;
};
