import {
  SquareCheck, ShieldCheck, Hash, Star, CheckCircle2, Scale, ListChecks, ChevronsUpDown,
  Type, CalendarClock, MapPin, PenLine, ScanLine, Wallet, Video, type LucideIcon,
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
