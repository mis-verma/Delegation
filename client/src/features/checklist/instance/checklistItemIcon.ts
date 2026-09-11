import {
  SquareCheck, ShieldCheck, Hash, Star, CheckCircle2, Scale, ListChecks, ChevronsUpDown,
  Type, CalendarClock, MapPin, PenLine, ScanLine, Wallet, Video, type LucideIcon,
} from 'lucide-react';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

// One glance at the leading icon tile now says what kind of answer an item wants, before reading
// the label — the 13 instance item cards used to be visually identical bordered boxes distinguished
// only by which control rendered inside, so a long checklist read as a wall of lookalike cards.
// Mirrors ChecklistDefinitionCard.tsx's own TAG_ICON_BY_LABEL for the handful of item types that
// already had an icon there (GPS/Signature/Cash tally/QR scan/Rating); the rest are new.
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
