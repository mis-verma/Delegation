import {
  CheckCircle2, ShieldCheck, List, ChevronDownSquare, AlignLeft, Hash, Calendar, Star,
  Camera, Video, PenLine, Users2, ScanLine, MapPin, Wallet, ClipboardCheck, SquareCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

export type QuestionGroup = 'basic' | 'media' | 'verify';

export interface QuestionTypeEntry {
  /** Stable id — itemType, except STANDARD which splits into checkbox vs photo. */
  id: string;
  label: string;
  /** One line shown under the label in the type menu. */
  hint: string;
  icon: LucideIcon;
  group: QuestionGroup;
  patch: Partial<ItemDraft>;
}

// The one catalog of question types — the palette, the per-question type menu and each card's
// icon all read from here, so a type is named and drawn the same way everywhere.
export const QUESTION_TYPES: QuestionTypeEntry[] = [
  { id: 'YES_NO', label: 'Yes / No', hint: 'Two buttons, with optional rules', icon: CheckCircle2, group: 'basic', patch: { itemType: 'YES_NO' } },
  { id: 'PASS_FAIL', label: 'Pass / Fail', hint: 'Inspection result, with optional rules', icon: ShieldCheck, group: 'basic', patch: { itemType: 'PASS_FAIL' } },
  { id: 'MULTIPLE_CHOICE', label: 'Multiple choice', hint: 'Pick one from a few options', icon: List, group: 'basic', patch: { itemType: 'MULTIPLE_CHOICE' } },
  { id: 'DROPDOWN', label: 'Dropdown', hint: 'Pick one from a longer list', icon: ChevronDownSquare, group: 'basic', patch: { itemType: 'DROPDOWN' } },
  { id: 'TEXT_BOX', label: 'Text answer', hint: 'Free text', icon: AlignLeft, group: 'basic', patch: { itemType: 'TEXT_BOX' } },
  { id: 'NUMBER_ENTRY', label: 'Number', hint: 'A reading, with optional limits', icon: Hash, group: 'basic', patch: { itemType: 'NUMBER_ENTRY' } },
  { id: 'DATE_TIME', label: 'Date & time', hint: 'When something happened', icon: Calendar, group: 'basic', patch: { itemType: 'DATE_TIME' } },
  { id: 'RATING', label: 'Rating', hint: 'Stars out of 3, 5 or 10', icon: Star, group: 'basic', patch: { itemType: 'RATING', ratingScale: '5' } },
  { id: 'CHECKBOX', label: 'Checkbox', hint: 'Tick when done', icon: SquareCheck, group: 'basic', patch: { itemType: 'STANDARD', requiredImageCount: '0' } },
  { id: 'PHOTO', label: 'Photo', hint: 'Photo proof, live or gallery', icon: Camera, group: 'media', patch: { itemType: 'STANDARD', requiredImageCount: '1' } },
  { id: 'VIDEO_UPLOAD', label: 'Video', hint: 'A short clip as proof', icon: Video, group: 'media', patch: { itemType: 'VIDEO_UPLOAD', requiredImageCount: '1' } },
  { id: 'SIGNATURE', label: 'Signature', hint: 'One signature on screen', icon: PenLine, group: 'media', patch: { itemType: 'SIGNATURE' } },
  { id: 'DUAL_SIGNATURE', label: 'Two signatures', hint: 'Employee and supervisor', icon: Users2, group: 'media', patch: { itemType: 'DUAL_SIGNATURE' } },
  { id: 'QR_SCAN', label: 'QR / barcode', hint: 'Scan a code, optionally a set one', icon: ScanLine, group: 'verify', patch: { itemType: 'QR_SCAN' } },
  { id: 'GPS', label: 'Location', hint: 'Prove they were on site', icon: MapPin, group: 'verify', patch: { itemType: 'GPS' } },
  { id: 'CASH_TALLY', label: 'Cash tally', hint: 'Count against an expected amount', icon: Wallet, group: 'verify', patch: { itemType: 'CASH_TALLY' } },
  { id: 'AUDIT', label: 'Audit', hint: 'Check a named list of people, one by one', icon: ClipboardCheck, group: 'verify', patch: { itemType: 'AUDIT' } },
];

export const QUESTION_GROUPS: { id: QuestionGroup; label: string }[] = [
  { id: 'basic', label: 'Answers' },
  { id: 'media', label: 'Proof & signatures' },
  { id: 'verify', label: 'Verification' },
];

// Opacity tints, not raw -50 swatches, so the tiles sit right on both light and dark surfaces.
export const GROUP_TILE: Record<QuestionGroup, string> = {
  basic: 'bg-primary-500/10 text-primary-700 dark:bg-primary-400/15 dark:text-primary-200',
  media: 'bg-coral-500/15 text-coral-700 dark:bg-coral-400/15 dark:text-coral-300',
  verify: 'bg-success/12 text-success dark:bg-success/15',
};

/** Which catalog entry a draft is — STANDARD reads as Photo when it asks for photos. */
export const questionTypeOf = (draft: Pick<ItemDraft, 'itemType' | 'requiredImageCount'>): QuestionTypeEntry => {
  if (draft.itemType === 'STANDARD') {
    return QUESTION_TYPES.find((t) => t.id === (Number(draft.requiredImageCount) > 0 ? 'PHOTO' : 'CHECKBOX'))!;
  }
  return QUESTION_TYPES.find((t) => t.id === draft.itemType) ?? QUESTION_TYPES[0];
};
