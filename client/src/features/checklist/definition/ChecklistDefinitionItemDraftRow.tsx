
import { ItemTypeConfigFields } from './builder/ItemTypeConfigFields';
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

// eslint-disable-next-line react-refresh/only-export-components
export const ITEM_TYPE_LABEL: Record<ChecklistItemType, string> = {
  STANDARD: 'Standard',
  AUDIT: 'Audit',
  NUMBER_ENTRY: 'Number entry',
  RATING: 'Rating',
  YES_NO: 'Yes / No',
  PASS_FAIL: 'Pass / Fail',
  MULTIPLE_CHOICE: 'Multiple choice',
  DROPDOWN: 'Dropdown',
  TEXT_BOX: 'Text box',
  DATE_TIME: 'Date & time',
  GPS: 'GPS location',
  SIGNATURE: 'Signature',
  DUAL_SIGNATURE: 'Dual signature',
  QR_SCAN: 'QR / Barcode scan',
  CASH_TALLY: 'Cash tally',
  VIDEO_UPLOAD: 'Video upload',
};

const ITEM_TYPES = [
  'STANDARD', 'AUDIT', 'NUMBER_ENTRY', 'RATING',
  'YES_NO', 'PASS_FAIL', 'MULTIPLE_CHOICE', 'DROPDOWN', 'TEXT_BOX', 'DATE_TIME',
  'GPS', 'SIGNATURE', 'DUAL_SIGNATURE', 'QR_SCAN', 'CASH_TALLY', 'VIDEO_UPLOAD',
] as const satisfies readonly ChecklistItemType[];

interface ChecklistDefinitionItemDraftRowProps {
  // Display-only (row number, placeholder text) — the draft being edited is identified by its
  // stable `key`, not this position, so a stale/racing index here can't mutate the wrong row.
  index: number;
  draft: ItemDraft;
  onChange: (key: string, patch: Partial<ItemDraft>) => void;
  storeIds?: string[];
  className?: string;
}

export const ChecklistDefinitionItemDraftRow = ({
  index,
  draft,
  onChange,
  storeIds,
  className = '',
}: ChecklistDefinitionItemDraftRowProps) => {
  const patch = (p: Partial<ItemDraft>) => onChange(draft.key, p);
  // A blank label used to be silently exempted from the "complete item" check — which meant
  // clearing an already-configured item's label (its audit users, GPS target, conditional
  // actions, all still set) let it pass every validity gate, then vanish from the actual save
  // with no warning. It's a real error state now, flagged right here instead of failing silently.
  const isLabelBlank = !draft.label.trim();

  return (
    <div
      className={`flex flex-col gap-3.5 p-4 rounded-lg border bg-surface transition-all duration-150 ${
        isLabelBlank ? 'border-danger/50' : 'border-border hover:border-border-hover'
      } ${className}`}
    >
      {/* Item Index + Main Description Input */}
      <div className="flex items-center gap-2.5">
        <span className="flex items-center justify-center size-7 rounded-md bg-muted/60 text-text-secondary text-xs font-mono font-bold shrink-0 tabular-nums select-none border border-border/40">
          {String(index + 1).padStart(2, '0')}
        </span>

        <input
          type="text"
          value={draft.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder={`Task ${index + 1} prompt (e.g. Inspect refrigeration temperature)...`}
          aria-label={`Task ${index + 1} title`}
          aria-invalid={isLabelBlank}
          className={`flex-1 min-w-0 px-3.5 py-2 text-sm font-display bg-surface text-text rounded-lg border placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:ring-2 ${
            isLabelBlank
              ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
              : 'border-border hover:border-border/80 focus:border-primary-500 focus:ring-primary-500/20'
          }`}
        />
      </div>

      {isLabelBlank && (
        <p className="text-[11px] font-display text-danger -mt-2">
          This item has no title, so it won't be saved — enter one or remove this item.
        </p>
      )}

      {/* Question Type Switcher — wraps to multiple rows instead of scrolling sideways, so all
          16 types stay visible and scannable even with several items stacked in the builder. */}
      <div
        role="radiogroup"
        aria-label="Question type switcher"
        className="flex flex-wrap gap-1.5 rounded-lg border border-border/80 bg-muted/30 p-2 text-xs font-display"
      >
        {ITEM_TYPES.map((type) => {
          const isSelected = draft.itemType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Switch type to ${ITEM_TYPE_LABEL[type]}`}
              onClick={() => patch({ itemType: type })}
              className={[
                'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                isSelected
                  ? 'bg-primary-700 text-white shadow-2xs font-semibold'
                  : 'text-text-muted hover:text-text hover:bg-surface/60',
              ].join(' ')}
            >
              {ITEM_TYPE_LABEL[type]}
            </button>
          );
        })}
      </div>

      {/* Type-specific Fields Configuration */}
      <div className="pt-2.5 border-t border-dashed border-border/60">
        <ItemTypeConfigFields draft={draft} onChange={patch} storeIds={storeIds} />
      </div>
    </div>
  );
};