import type { ReactNode } from 'react';
import { Camera, Video, MapPin, QrCode, Info, Star } from 'lucide-react';
import { UserMultiSelect, AccessoriesListEditor } from '../../../../components';
import { ConditionalLogicPanel } from './ConditionalLogicPanel';
import type { ChecklistItemType } from '../../../../api/checklistDefinitions';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

export interface ItemTypeFieldsProps {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  /** Every store this checklist targets, so an auditor can come from any of them. */
  storeIds?: string[];
}

const FIELD_LABEL = 'text-[11px] font-display font-semibold text-text-muted';
const INPUT_BASE =
  'px-2.5 py-1.5 text-xs font-display bg-surface text-text rounded-md border border-border ' +
  'placeholder:text-text-muted/60 hover:border-border/80 transition-all duration-150 ' +
  'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

const PhotoFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex flex-wrap items-center gap-3.5 pt-0.5">
    {/* Min / Max Photo Counter Pill */}
    <div className="inline-flex items-center gap-2.5 bg-muted/40 p-1.5 rounded-lg border border-border/80 shadow-2xs">
      <Camera size={14} className="text-text-muted ml-1 shrink-0" />
      <div className="flex items-center gap-1.5">
        <label htmlFor="photo-min-count" className={FIELD_LABEL}>Min</label>
        <input
          id="photo-min-count"
          type="number"
          min={0}
          value={draft.requiredImageCount}
          onChange={(e) => onChange({ requiredImageCount: e.target.value })}
          className={`w-12 text-center font-mono ${INPUT_BASE}`}
        />
      </div>
      <div className="h-4 w-px bg-border/80" />
      <div className="flex items-center gap-1.5 pr-0.5">
        <label htmlFor="photo-max-count" className={FIELD_LABEL}>Max</label>
        <input
          id="photo-max-count"
          type="number"
          min={0}
          value={draft.maxImageCount}
          onChange={(e) => onChange({ maxImageCount: e.target.value })}
          placeholder="∞"
          className={`w-12 text-center font-mono ${INPUT_BASE}`}
        />
      </div>
    </div>

    {/* Live Photo Toggle */}
    <label className="inline-flex items-center gap-2 text-xs font-display text-text-secondary hover:text-text cursor-pointer select-none transition-colors">
      <input
        type="checkbox"
        checked={draft.requiresLivePhoto}
        onChange={(e) => onChange({ requiresLivePhoto: e.target.checked })}
        className="size-4 rounded-sm border-border text-primary-700 focus:ring-primary-500/30 cursor-pointer"
      />
      <span>Live photo only — no uploading from the gallery</span>
    </label>
  </div>
);

const VideoFields = (props: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-2.5">
    <PhotoFields {...props} />
    <div className="flex items-center gap-1.5 text-[11px] font-display text-text-muted">
      <Video size={13} className="shrink-0 text-text-muted" />
      <span>Accepts short video clips instead of photos — Min/Max above apply to clips.</span>
    </div>
  </div>
);

const AuditFields = ({ draft, onChange, storeIds }: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL}>Who audits this?</span>
      <UserMultiSelect
        storeIds={storeIds}
        selected={draft.auditUserIds}
        onChange={(ids) => onChange({ auditUserIds: ids })}
      />
    </div>
    <AccessoriesListEditor
      accessories={draft.accessories}
      onChange={(accessories) => onChange({ accessories })}
    />
  </div>
);

const NumberFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex flex-wrap items-end gap-3 pt-0.5">
    <div className="flex flex-col gap-1">
      <label htmlFor="number-unit" className={FIELD_LABEL}>Unit</label>
      <input
        id="number-unit"
        value={draft.numberEntryUnit}
        onChange={(e) => onChange({ numberEntryUnit: e.target.value })}
        placeholder="₹, kg, pcs…"
        className={`w-24 text-left ${INPUT_BASE}`}
      />
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor="number-min" className={FIELD_LABEL}>Min Bound</label>
      <input
        id="number-min"
        type="number"
        value={draft.numberEntryMin}
        onChange={(e) => onChange({ numberEntryMin: e.target.value })}
        placeholder="—"
        className={`w-20 text-center font-mono ${INPUT_BASE}`}
      />
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor="number-max" className={FIELD_LABEL}>Max Bound</label>
      <input
        id="number-max"
        type="number"
        value={draft.numberEntryMax}
        onChange={(e) => onChange({ numberEntryMax: e.target.value })}
        placeholder="—"
        className={`w-20 text-center font-mono ${INPUT_BASE}`}
      />
    </div>
    {draft.itemType === 'CASH_TALLY' && (
      <div className="flex flex-col gap-1">
        <label htmlFor="cash-expected" className={FIELD_LABEL}>Expected Target</label>
        <input
          id="cash-expected"
          type="number"
          value={draft.cashExpectedAmount}
          onChange={(e) => onChange({ cashExpectedAmount: e.target.value })}
          placeholder="Optional"
          className={`w-28 text-center font-mono ${INPUT_BASE}`}
        />
      </div>
    )}
  </div>
);

const RATING_SCALES = ['3', '5', '10'];

const RatingFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex items-center gap-3 pt-0.5">
    <span className={FIELD_LABEL}>Scale rating out of</span>
    <div
      role="radiogroup"
      aria-label="Rating scale"
      className="inline-flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 shadow-2xs"
    >
      {RATING_SCALES.map((scale) => {
        const isSelected = draft.ratingScale === scale;
        return (
          <button
            key={scale}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange({ ratingScale: scale })}
            className={[
              'flex items-center gap-1 px-3 py-1 rounded-md text-xs font-display font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
              isSelected
                ? 'bg-surface text-primary-700 dark:text-primary-400 font-bold shadow-xs border border-border/50'
                : 'text-text-muted hover:text-text hover:bg-surface/50',
            ].join(' ')}
          >
            <Star size={11} className={isSelected ? 'fill-primary-700 dark:fill-primary-400 text-primary-700 dark:text-primary-400' : 'text-text-muted'} />
            <span>{scale}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const GpsFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-2 pt-0.5">
    <p className="text-[11px] font-display text-text-muted flex items-center gap-1.5">
      <MapPin size={12} className="text-text-muted shrink-0" />
      <span>Pin an exact coordinate (optional — leave blank to record staff location without geofencing).</span>
    </p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="gps-lat" className={FIELD_LABEL}>Latitude</label>
        <input
          id="gps-lat"
          type="number"
          step="any"
          value={draft.gpsTargetLat}
          onChange={(e) => onChange({ gpsTargetLat: e.target.value })}
          placeholder="e.g. 12.9716"
          className={`w-28 text-left font-mono ${INPUT_BASE}`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="gps-lng" className={FIELD_LABEL}>Longitude</label>
        <input
          id="gps-lng"
          type="number"
          step="any"
          value={draft.gpsTargetLng}
          onChange={(e) => onChange({ gpsTargetLng: e.target.value })}
          placeholder="e.g. 77.5946"
          className={`w-28 text-left font-mono ${INPUT_BASE}`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="gps-radius" className={FIELD_LABEL}>Radius (meters)</label>
        <input
          id="gps-radius"
          type="number"
          min={1}
          value={draft.gpsRadiusMeters}
          onChange={(e) => onChange({ gpsRadiusMeters: e.target.value })}
          placeholder="e.g. 100"
          className={`w-24 text-center font-mono ${INPUT_BASE}`}
        />
      </div>
    </div>
  </div>
);

const QrFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-1.5 pt-0.5">
    <label htmlFor="qr-expected-code" className={FIELD_LABEL}>
      Expected Barcode / QR Code <span className="text-text-muted/70 font-medium">(Optional)</span>
    </label>
    <div className="relative">
      <input
        id="qr-expected-code"
        value={draft.qrExpectedValue}
        onChange={(e) => onChange({ qrExpectedValue: e.target.value })}
        placeholder="e.g. SKU-04821 (Leave blank to accept any scanned barcode)"
        className={`w-full text-left font-mono pr-8 ${INPUT_BASE}`}
      />
      <QrCode size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
    </div>
  </div>
);

const OptionsFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <AccessoriesListEditor
    label="Options"
    accessories={draft.options}
    onChange={(options) => onChange({ options })}
  />
);

const ConditionalFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  if (draft.itemType !== 'YES_NO' && draft.itemType !== 'PASS_FAIL') return null;
  return (
    <ConditionalLogicPanel
      itemType={draft.itemType}
      yesActions={draft.yesActions}
      noActions={draft.noActions}
      onYesActionsChange={(actions) => onChange({ yesActions: actions })}
      onNoActionsChange={(actions) => onChange({ noActions: actions })}
    />
  );
};

const infoNote = (text: string) => () => (
  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs font-display text-text-secondary leading-relaxed">
    <Info size={14} className="text-text-muted shrink-0" />
    <span>{text}</span>
  </div>
);

type FieldRenderer = (props: ItemTypeFieldsProps) => ReactNode;

// Single source of truth for "what does this question type need to be configured?"
const FIELDS_BY_TYPE: Partial<Record<ChecklistItemType, FieldRenderer>> = {
  STANDARD: PhotoFields,
  VIDEO_UPLOAD: VideoFields,
  AUDIT: AuditFields,
  NUMBER_ENTRY: NumberFields,
  CASH_TALLY: NumberFields,
  RATING: RatingFields,
  GPS: GpsFields,
  QR_SCAN: QrFields,
  MULTIPLE_CHOICE: OptionsFields,
  DROPDOWN: OptionsFields,
  YES_NO: ConditionalFields,
  PASS_FAIL: ConditionalFields,
  SIGNATURE: infoNote('Captures one signature drawn on-screen by the store staff.'),
  DUAL_SIGNATURE: infoNote('Captures two signatures drawn on-screen sequentially — e.g., employee followed by supervisor.'),
};

export const ItemTypeConfigFields = (props: ItemTypeFieldsProps) => {
  const Renderer = FIELDS_BY_TYPE[props.draft.itemType];
  if (!Renderer) {
    return (
      <p className="text-xs font-display text-text-muted italic py-1">
        Nothing else to set up for this type.
      </p>
    );
  }
  return <>{Renderer(props)}</>;
};

// The exports below are colocated with the component like ui/badge.tsx's own badgeVariants export —
// only affects Fast Refresh granularity (a full reload instead of a hot-swap when this file
// changes), not runtime correctness.
const PHOTO_TYPES: ItemDraft['itemType'][] = ['STANDARD', 'VIDEO_UPLOAD', 'AUDIT'];
const num = (v: string) => (v.trim() === '' ? null : Number(v));

// What's wrong with this question, in words an admin can act on — or null when it's ready. Mirrors
// the server's zod rules (checklistDefinition.validation.ts) so a bad setting is caught on the
// question itself instead of as a generic error at the final Save.
// eslint-disable-next-line react-refresh/only-export-components
export const itemDraftProblem = (draft: ItemDraft): string | null => {
  if (draft.label.trim().length > 191) return 'Keep the question under 191 characters.';
  if (draft.itemType === 'AUDIT' && draft.auditUserIds.length === 0) return 'Pick at least one auditor.';
  if ((draft.itemType === 'MULTIPLE_CHOICE' || draft.itemType === 'DROPDOWN') && draft.options.length < 2) return 'Add at least two options.';
  if (PHOTO_TYPES.includes(draft.itemType)) {
    const min = num(draft.requiredImageCount) ?? 0;
    const max = num(draft.maxImageCount);
    if (draft.itemType === 'VIDEO_UPLOAD' && min < 1) return 'A video question needs at least 1 video.';
    if (max != null && min > max) return "Minimum can't be more than the maximum — staff could never finish it.";
  }
  if (draft.itemType === 'NUMBER_ENTRY' || draft.itemType === 'CASH_TALLY') {
    const min = num(draft.numberEntryMin);
    const max = num(draft.numberEntryMax);
    if (min != null && max != null && min > max) return "Minimum can't be more than the maximum.";
  }
  if (draft.itemType === 'CASH_TALLY' && (num(draft.cashExpectedAmount) ?? 0) < 0) return "Expected amount can't be negative.";
  if (draft.itemType === 'GPS') {
    const lat = num(draft.gpsTargetLat);
    const lng = num(draft.gpsTargetLng);
    const radius = num(draft.gpsRadiusMeters);
    if ((lat == null) !== (lng == null)) return 'Enter both latitude and longitude, or neither.';
    if (lat != null && (lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90.';
    if (lng != null && (lng < -180 || lng > 180)) return 'Longitude must be between -180 and 180.';
    if (radius != null && radius < 1) return 'Radius must be at least 1 metre.';
    if (radius != null && lat == null) return 'Set the target location for this radius.';
    if (lat != null && radius == null) return 'Set a radius, or the location is never checked.';
  }
  return null;
};

// eslint-disable-next-line react-refresh/only-export-components
export const isItemDraftComplete = (draft: ItemDraft): boolean => itemDraftProblem(draft) === null;

// Switching an item's type used to change only `itemType`, carrying every other setting along —
// e.g. a Photo item switched to Text box still required 1 photo, with no upload button shown to
// staff, so it could never be completed. This resets whatever the new type can't use.
// eslint-disable-next-line react-refresh/only-export-components
export const patchForTypeSwitch = (draft: ItemDraft, itemType: ItemDraft['itemType']): Partial<ItemDraft> => {
  const patch: Partial<ItemDraft> = { itemType };
  if (!PHOTO_TYPES.includes(itemType)) {
    patch.requiredImageCount = '0';
    patch.maxImageCount = '';
    patch.requiresLivePhoto = false;
  } else if (itemType === 'VIDEO_UPLOAD' && (num(draft.requiredImageCount) ?? 0) < 1) {
    patch.requiredImageCount = '1';
  }
  if (itemType !== 'YES_NO' && itemType !== 'PASS_FAIL') {
    patch.yesActions = [];
    patch.noActions = [];
  }
  return patch;
};