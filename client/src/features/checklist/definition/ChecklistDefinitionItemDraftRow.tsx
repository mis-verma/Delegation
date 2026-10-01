import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { ItemTypeConfigFields, itemDraftProblem, patchForTypeSwitch } from './builder/ItemTypeConfigFields';
import { QuestionTypeMenu } from './builder/QuestionTypeMenu';
import { GROUP_TILE, questionTypeOf, type QuestionTypeEntry } from './builder/questionTypes';
import type { ChecklistItemType, ChecklistConditionalAction } from '../../../api/checklistDefinitions';

export type ItemDraft = {
  // Client-only identity for drag-and-drop and React keys — stable across reorders, unlike the
  // array index. Set to the definition item's real id when hydrating an existing checklist.
  key: string;
  // Free-text grouping label (e.g. "Opening", "Closing", "Operational"); null = ungrouped.
  section: string | null;
  label: string;
  requiredImageCount: string;
  maxImageCount: string;
  requiresLivePhoto: boolean;
  itemType: ChecklistItemType;
  auditUserIds: string[];
  accessories: string[];
  // AUDIT only: separate lists for female / male people (empty = they get `accessories`).
  accessoriesFemale: string[];
  accessoriesMale: string[];
  numberEntryUnit: string;
  numberEntryMin: string;
  numberEntryMax: string;
  ratingScale: string;
  options: string[];
  gpsTargetLat: string;
  gpsTargetLng: string;
  gpsRadiusMeters: string;
  qrExpectedValue: string;
  cashExpectedAmount: string;
  // Two independent action sets — one per possible Yes/No answer — so both can be armed on the
  // same item at once (e.g. Yes requires a photo AND No requires a reason).
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
};

// eslint-disable-next-line react-refresh/only-export-components
export const emptyItemDraft = (): ItemDraft => ({
  key: crypto.randomUUID(),
  section: null,
  label: '',
  requiredImageCount: '0',
  maxImageCount: '',
  requiresLivePhoto: false,
  itemType: 'STANDARD',
  auditUserIds: [],
  accessories: [],
  accessoriesFemale: [],
  accessoriesMale: [],
  numberEntryUnit: '',
  numberEntryMin: '',
  numberEntryMax: '',
  ratingScale: '5',
  options: [],
  gpsTargetLat: '',
  gpsTargetLng: '',
  gpsRadiusMeters: '',
  qrExpectedValue: '',
  cashExpectedAmount: '',
  yesActions: [],
  noActions: [],
});

/** Type switch for a catalog entry: clears what the new type can't use, then applies its preset. */
// eslint-disable-next-line react-refresh/only-export-components
export const patchForEntry = (draft: ItemDraft, entry: QuestionTypeEntry): Partial<ItemDraft> => {
  const itemType = entry.patch.itemType ?? 'STANDARD';
  const patch: Partial<ItemDraft> = { ...patchForTypeSwitch(draft, itemType), ...entry.patch };
  // Checkbox and Photo are both STANDARD, so the generic switch keeps photo settings; a Checkbox
  // must drop them or it would still ask for photos.
  if (entry.id === 'CHECKBOX') Object.assign(patch, { maxImageCount: '', requiresLivePhoto: false });
  return patch;
};

interface ChecklistDefinitionItemDraftRowProps {
  // Display-only (row number) — the draft being edited is identified by its stable `key`, not this
  // position, so a stale/racing index here can't mutate the wrong row.
  index: number;
  draft: ItemDraft;
  onChange: (key: string, patch: Partial<ItemDraft>) => void;
  storeIds?: string[];
  /** Drag handle, rendered at the card's top-left. */
  leading?: ReactNode;
  /** Card actions (remove), rendered at the top-right. */
  trailing?: ReactNode;
  className?: string;
}

// One question, as one card: its type tile, the question itself typed straight into the header,
// the type chip, then only the settings this type needs. Replaces a card that repeated the label
// "What should staff do or answer?" and a 16-button type switcher on every single question.
export const ChecklistDefinitionItemDraftRow = ({
  index,
  draft,
  onChange,
  storeIds,
  leading,
  trailing,
  className = '',
}: ChecklistDefinitionItemDraftRowProps) => {
  const patch = (p: Partial<ItemDraft>) => onChange(draft.key, p);
  const type = questionTypeOf(draft);
  const TypeIcon = type.icon;
  // A blank label is a real error state (the item would be dropped on save), flagged right here.
  const isLabelBlank = !draft.label.trim();
  const problem = isLabelBlank ? 'Type the question staff will see — without one it won’t be saved.' : itemDraftProblem(draft);
  const pickType = (entry: QuestionTypeEntry) => patch(patchForEntry(draft, entry));

  return (
    <article
      aria-label={`Question ${index + 1}`}
      className={`group/q flex flex-col rounded-2xl border bg-surface transition-colors duration-150 ${
        problem ? 'border-danger/40' : 'border-border hover:border-border-hover focus-within:border-primary-400/70'
      } ${className}`}
    >
      <div className="flex items-start gap-1 sm:gap-3 p-2.5 pr-1.5 sm:p-4 sm:pr-2">
        {leading}
        <span className={`hidden sm:flex items-center justify-center size-10 rounded-xl shrink-0 ${GROUP_TILE[type.group]}`} aria-hidden="true">
          <TypeIcon size={18} strokeWidth={2.25} />
        </span>

        {/* Settings live in the same column as the question, so they line up under it by
            structure rather than by a guessed left padding. */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <label htmlFor={`item-label-${draft.key}`} className="text-[11px] font-display font-medium text-text-muted tabular-nums">
                Question {index + 1}
              </label>
              <textarea
                id={`item-label-${draft.key}`}
                rows={1}
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Type the question staff will see"
                aria-invalid={isLabelBlank}
                className="w-full resize-none field-sizing-content min-h-7 -mx-1.5 px-1.5 py-0.5 rounded-md bg-transparent text-[15px] leading-snug font-display font-semibold text-text placeholder:font-medium placeholder:text-text-light hover:bg-surface-hover/60 focus:bg-surface-hover/60 focus:outline-none transition-colors duration-150"
              />
            </div>
            <div className="hidden sm:block shrink-0 pt-3">
              <QuestionTypeMenu draft={draft} onPick={pickType} />
            </div>
          </div>

          <div className="sm:hidden">
            <QuestionTypeMenu draft={draft} onPick={pickType} />
          </div>
          <ItemTypeConfigFields draft={draft} onChange={patch} storeIds={storeIds} />
          {problem && (
            <p role="alert" className="flex items-start gap-1.5 text-xs font-display font-medium text-danger">
              <AlertCircle size={13} className="shrink-0 mt-px" />
              {problem}
            </p>
          )}
        </div>

        {trailing}
      </div>
    </article>
  );
};
