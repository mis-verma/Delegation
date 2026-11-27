import {
  SquareCheck, ShieldCheck, Hash, Star, CheckCircle2, Scale, ListChecks, ChevronsUpDown,
  Type, CalendarClock, MapPin, PenLine, ScanLine, Wallet, Video, Camera, ImageUp, Ban, type LucideIcon,
} from 'lucide-react';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

export const ITEM_TYPE_ICON: Record<ChecklistInstanceItem['itemType'], LucideIcon> = {
  STANDARD: SquareCheck,
  AUDIT: ShieldCheck,
  NUMBER_ENTRY: Hash,
  RATING: Star,
  YES_NO: CheckCircle2,
  PASS_FAIL: Scale,
  MULTIPLE_CHOICE: ListChecks,
  DROPDOWN: ChevronsUpDown,
  TEXT_BOX: Type,
  DATE_TIME: CalendarClock,
  GPS: MapPin,
  SIGNATURE: PenLine,
  DUAL_SIGNATURE: PenLine,
  QR_SCAN: ScanLine,
  CASH_TALLY: Wallet,
  VIDEO_UPLOAD: Video,
};

export interface ItemRequirementBadge {
  icon: LucideIcon;
  tone: string;
  label: string;
  title: string;
}

type RequirementSource = Pick<ChecklistInstanceItem, 'requiredImageCount' | 'maxImageCount' | 'allowNotApplicable'>;

/** What a question asks for, independent of whether it's been answered yet: a mandatory or
 * optional photo, and whether it can be marked not applicable. Shown so staff can scan what's
 * expected before they open the question. */
export const itemRequirementBadges = (item: RequirementSource): ItemRequirementBadge[] => {
  const badges: ItemRequirementBadge[] = [];
  if (item.requiredImageCount > 0) {
    badges.push({ icon: Camera, tone: 'bg-primary-600', label: 'Photo required', title: 'A photo is required to complete this question' });
  } else if ((item.maxImageCount ?? 0) > 0) {
    badges.push({ icon: ImageUp, tone: 'bg-text-muted', label: 'Photo optional', title: 'A photo can be added, but is not required' });
  }
  if (item.allowNotApplicable) {
    badges.push({ icon: Ban, tone: 'bg-text-light', label: 'Can mark N/A', title: 'This question can be marked not applicable' });
  }
  return badges;
};
