import { useState } from 'react';
import {
  CheckCircle2, ShieldCheck, List, ChevronDownSquare, AlignLeft, Hash, Calendar, Star,
  Camera, Video, PenLine, Users2, ScanLine, MapPin, Wallet, ClipboardCheck, SquareCheck,
  Plus, type LucideIcon,
} from 'lucide-react';
import { AddQuestionModal } from './AddQuestionModal';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

export interface PaletteEntry {
  label: string;
  icon: LucideIcon;
  patch: Partial<ItemDraft>;
}

interface PaletteCategory {
  title: string;
  entries: PaletteEntry[];
}

// Static catalog of every question type the Builder can add — grouped the way the reference
// UI kit groups its component demos (small bold section labels), so the 17 types stay
// scannable instead of one long undifferentiated list.
const CATEGORIES: PaletteCategory[] = [
  {
    title: 'Basic Answers',
    entries: [
      { label: 'Yes / No', icon: CheckCircle2, patch: { itemType: 'YES_NO' } },
      { label: 'Pass / Fail', icon: ShieldCheck, patch: { itemType: 'PASS_FAIL' } },
      { label: 'Multiple choice', icon: List, patch: { itemType: 'MULTIPLE_CHOICE' } },
      { label: 'Dropdown', icon: ChevronDownSquare, patch: { itemType: 'DROPDOWN' } },
      { label: 'Text box', icon: AlignLeft, patch: { itemType: 'TEXT_BOX' } },
      { label: 'Number entry', icon: Hash, patch: { itemType: 'NUMBER_ENTRY' } },
      { label: 'Date & time', icon: Calendar, patch: { itemType: 'DATE_TIME' } },
      { label: 'Rating', icon: Star, patch: { itemType: 'RATING', ratingScale: '5' } },
      { label: 'Simple checkbox', icon: SquareCheck, patch: { itemType: 'STANDARD', requiredImageCount: '0' } },
    ],
  },
  {
    title: 'Media & Signature',
    entries: [
      { label: 'Photo upload', icon: Camera, patch: { itemType: 'STANDARD', requiredImageCount: '1' } },
      { label: 'Video upload', icon: Video, patch: { itemType: 'VIDEO_UPLOAD', requiredImageCount: '1' } },
      { label: 'Signature', icon: PenLine, patch: { itemType: 'SIGNATURE' } },
      { label: 'Dual signature', icon: Users2, patch: { itemType: 'DUAL_SIGNATURE' } },
    ],
  },
  {
    title: 'Verification',
    entries: [
      { label: 'Barcode / QR scan', icon: ScanLine, patch: { itemType: 'QR_SCAN' } },
      { label: 'GPS verification', icon: MapPin, patch: { itemType: 'GPS' } },
      { label: 'Cash tally', icon: Wallet, patch: { itemType: 'CASH_TALLY' } },
      { label: 'Audit', icon: ClipboardCheck, patch: { itemType: 'AUDIT' } },
    ],
  },
];

interface QuestionTypePaletteProps {
  onAdd: (patch: Partial<ItemDraft>) => void;
  storeIds?: string[];
}

export const QuestionTypePalette = ({ onAdd, storeIds }: QuestionTypePaletteProps) => {
  const [activeEntry, setActiveEntry] = useState<PaletteEntry | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-1 pb-2 text-xs font-display font-bold text-text-muted">Question Types</h2>
      {CATEGORIES.map(({ title, entries }, i) => (
        <div key={title} className={i > 0 ? 'mt-3' : ''}>
          <p className="px-2.5 pb-1 text-[10px] font-display font-bold text-text-light">{title}</p>
          {/* Two columns on phones: 17 one-per-row entries made the Items step a long scroll
              before you ever reached the items themselves. */}
          <div className="grid grid-cols-2 gap-1 lg:flex lg:flex-col lg:gap-0.5">
            {entries.map(entry => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => setActiveEntry(entry)}
                  // Opacity-tinted hovers, not the raw `-50`/`-100`/`-700` swatches this used to be
                  // — this app's primary-* scale isn't redefined for dark mode (see index.css), so
                  // a literal `bg-primary-50` hover here rendered as a stark near-white smudge on
                  // this list in dark theme instead of a subtle tint.
                  className="group relative flex w-full min-h-11 items-center gap-2 lg:gap-2.5 rounded-lg px-2 lg:px-2.5 py-2 text-left text-[13px] lg:text-sm font-display font-medium text-text-secondary transition-all duration-200 hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-hover text-text-muted transition-colors duration-200 group-hover:bg-primary-500/15 group-hover:text-primary-700 dark:group-hover:text-primary-300">
                    <Icon size={16} strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">{entry.label}</span>
                  <span className="hidden lg:flex size-6 shrink-0 scale-75 items-center justify-center rounded-full border border-border text-text-light opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:border-primary-400 group-hover:bg-primary-500/10 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:opacity-100">
                    <Plus size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {activeEntry && (
        <AddQuestionModal
          entry={activeEntry}
          storeIds={storeIds}
          onClose={() => setActiveEntry(null)}
          onConfirm={patch => { onAdd(patch); setActiveEntry(null); }}
        />
      )}
    </div>
  );
};