import type { ReactNode } from 'react';
import { Camera, Video, MapPin, Info, Star, Plus, X } from 'lucide-react';
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

// ─── Shared field primitives ────────────────────────────────────────────────────────────────
// One label style, one input style, one switch — so every question type's settings read as the
// same form rather than a different mini-widget per type.

const LABEL = 'text-[11px] font-display font-medium text-text-muted';
const INPUT =
  'h-9 px-3 text-sm font-display bg-surface text-text rounded-lg border border-border tabular-nums ' +
  'placeholder:text-text-light hover:border-border-hover transition-colors duration-150 ' +
  'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

// Per-question ids: several questions are open at once, so a fixed id ("number-min") made every
// label focus the first question's input.
const fid = (draft: ItemDraft, name: string) => `${name}-${draft.key}`;

const Field = ({ id, label, children, className = '' }: { id: string; label: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <label htmlFor={id} className={LABEL}>{label}</label>
    {children}
  </div>
);

const Switch = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="group flex items-center gap-2.5 w-fit text-left cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-primary-600 dark:bg-primary-400' : 'bg-border group-hover:bg-border-hover'}`}>
      <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${checked ? 'translate-x-4' : ''}`} />
    </span>
    <span className="flex flex-col">
      <span className="text-[13px] font-display font-medium text-text">{label}</span>
      {hint && <span className="text-[11px] font-display text-text-muted">{hint}</span>}
    </span>
  </button>
);

const Note = ({ icon: Icon = Info, children }: { icon?: typeof Info; children: ReactNode }) => (
  <p className="flex items-start gap-1.5 text-xs font-display text-text-muted leading-relaxed">
    <Icon size={13} className="shrink-0 mt-0.5 text-text-light" />
    <span>{children}</span>
  </p>
);

// ─── Per-type settings ──────────────────────────────────────────────────────────────────────

const PhotoCountFields = ({ draft, onChange, noun }: ItemTypeFieldsProps & { noun: 'photos' | 'videos' }) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-end gap-3">
      <Field id={fid(draft, 'min')} label={`Minimum ${noun}`}>
        <input
          id={fid(draft, 'min')}
          type="number"
          inputMode="numeric"
          min={noun === 'videos' ? 1 : 0}
          value={draft.requiredImageCount}
          onChange={(e) => onChange({ requiredImageCount: e.target.value })}
          className={`w-24 ${INPUT}`}
        />
      </Field>
      <Field id={fid(draft, 'max')} label="Maximum">
        <input
          id={fid(draft, 'max')}
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.maxImageCount}
          onChange={(e) => onChange({ maxImageCount: e.target.value })}
          placeholder="No limit"
          className={`w-24 ${INPUT}`}
        />
      </Field>
    </div>
    <Switch
      checked={draft.requiresLivePhoto}
      onChange={(v) => onChange({ requiresLivePhoto: v })}
      label={noun === 'videos' ? 'Record live only' : 'Live camera only'}
      hint="No picking from the gallery"
    />
  </div>
);

// STANDARD is both "Checkbox" (no photos) and "Photo" (≥1 photo). A checkbox offers a one-tap way
// to ask for proof instead of showing photo counters nobody asked for.
const StandardFields = (props: ItemTypeFieldsProps) => {
  const { draft, onChange } = props;
  if (Number(draft.requiredImageCount) > 0) return <PhotoCountFields {...props} noun="photos" />;
  return (
    <button
      type="button"
      onClick={() => onChange({ requiredImageCount: '1' })}
      className="inline-flex items-center gap-1.5 w-fit h-8 px-3 rounded-full border border-dashed border-border text-xs font-display font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <Camera size={13} /> Also ask for a photo
    </button>
  );
};

const VideoFields = (props: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-2.5">
    <PhotoCountFields {...props} noun="videos" />
    <Note icon={Video}>Staff record or upload short clips. Photos aren’t accepted here.</Note>
  </div>
);

const AuditFields = ({ draft, onChange, storeIds }: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>Who audits this?</span>
      <UserMultiSelect storeIds={storeIds} selected={draft.auditUserIds} onChange={(ids) => onChange({ auditUserIds: ids })} />
    </div>
    <AccessoriesListEditor
      label="Things to check (optional)"
      placeholder="e.g. ID card, uniform"
      accessories={draft.accessories}
      onChange={(accessories) => onChange({ accessories })}
    />
  </div>
);

const NumberFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  const isCash = draft.itemType === 'CASH_TALLY';
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
      {isCash && (
        <Field id={fid(draft, 'expected')} label="Expected amount" className="col-span-2 sm:col-span-1">
          <input
            id={fid(draft, 'expected')}
            type="number"
            inputMode="decimal"
            min={0}
            value={draft.cashExpectedAmount}
            onChange={(e) => onChange({ cashExpectedAmount: e.target.value })}
            placeholder="e.g. 5000"
            className={`w-full sm:w-36 ${INPUT}`}
          />
        </Field>
      )}
      <Field id={fid(draft, 'unit')} label="Unit">
        <input
          id={fid(draft, 'unit')}
          value={draft.numberEntryUnit}
          onChange={(e) => onChange({ numberEntryUnit: e.target.value })}
          placeholder={isCash ? '₹' : 'kg, °C, pcs'}
          className={`w-full sm:w-24 ${INPUT}`}
        />
      </Field>
      <Field id={fid(draft, 'nmin')} label="Lowest allowed">
        <input
          id={fid(draft, 'nmin')}
          type="number"
          inputMode="decimal"
          value={draft.numberEntryMin}
          onChange={(e) => onChange({ numberEntryMin: e.target.value })}
          placeholder="Any"
          className={`w-full sm:w-28 ${INPUT}`}
        />
      </Field>
      <Field id={fid(draft, 'nmax')} label="Highest allowed">
        <input
          id={fid(draft, 'nmax')}
          type="number"
          inputMode="decimal"
          value={draft.numberEntryMax}
          onChange={(e) => onChange({ numberEntryMax: e.target.value })}
          placeholder="Any"
          className={`w-full sm:w-28 ${INPUT}`}
        />
      </Field>
      {isCash && (
        <p className="col-span-2 text-[11px] font-display text-text-muted sm:basis-full">
          If the count doesn’t match, staff must give a reason.
        </p>
      )}
    </div>
  );
};

const RATING_SCALES = ['3', '5', '10'];

const RatingFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-1.5">
    <span className={LABEL}>Out of</span>
    <div role="radiogroup" aria-label="Rating scale" className="inline-flex w-fit items-center gap-0.5 rounded-full bg-surface-hover p-0.5">
      {RATING_SCALES.map((scale) => {
        const selected = draft.ratingScale === scale;
        return (
          <button
            key={scale}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange({ ratingScale: scale })}
            className={`flex items-center gap-1 h-8 px-3.5 rounded-full text-xs font-display font-semibold cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
              selected ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
            }`}
          >
            <Star size={12} className={selected ? 'fill-coral-500 text-coral-500' : ''} />
            {scale}
          </button>
        );
      })}
    </div>
  </div>
);

const GpsFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  const hasTarget = draft.gpsTargetLat.trim() !== '' || draft.gpsTargetLng.trim() !== '' || draft.gpsRadiusMeters.trim() !== '';
  if (!hasTarget) {
    return (
      <div className="flex flex-col gap-2">
        <Note icon={MapPin}>Records where staff are when they answer.</Note>
        <button
          type="button"
          onClick={() => onChange({ gpsRadiusMeters: '100' })}
          className="inline-flex items-center gap-1.5 w-fit h-8 px-3 rounded-full border border-dashed border-border text-xs font-display font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Plus size={13} /> Only accept near a set spot
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
        <Field id={fid(draft, 'lat')} label="Latitude">
          <input id={fid(draft, 'lat')} type="number" step="any" inputMode="decimal" value={draft.gpsTargetLat}
            onChange={(e) => onChange({ gpsTargetLat: e.target.value })} placeholder="30.9045" className={`w-full sm:w-32 ${INPUT}`} />
        </Field>
        <Field id={fid(draft, 'lng')} label="Longitude">
          <input id={fid(draft, 'lng')} type="number" step="any" inputMode="decimal" value={draft.gpsTargetLng}
            onChange={(e) => onChange({ gpsTargetLng: e.target.value })} placeholder="77.0967" className={`w-full sm:w-32 ${INPUT}`} />
        </Field>
        <Field id={fid(draft, 'radius')} label="Within (metres)">
          <input id={fid(draft, 'radius')} type="number" min={1} inputMode="numeric" value={draft.gpsRadiusMeters}
            onChange={(e) => onChange({ gpsRadiusMeters: e.target.value })} placeholder="100" className={`w-full sm:w-28 ${INPUT}`} />
        </Field>
        <button
          type="button"
          onClick={() => onChange({ gpsTargetLat: '', gpsTargetLng: '', gpsRadiusMeters: '' })}
          className="self-end inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-display font-medium text-text-muted cursor-pointer hover:text-danger hover:bg-danger/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <X size={13} /> Remove spot
        </button>
      </div>
      <Note icon={MapPin}>Tip: open the store in Google Maps, long-press it and copy the two numbers.</Note>
    </div>
  );
};

const QrFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <Field id={fid(draft, 'qr')} label="Code it must match (optional)">
    <input
      id={fid(draft, 'qr')}
      value={draft.qrExpectedValue}
      onChange={(e) => onChange({ qrExpectedValue: e.target.value })}
      placeholder="Leave blank to accept any code"
      className={`w-full sm:max-w-sm ${INPUT}`}
    />
  </Field>
);

const OptionsFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <AccessoriesListEditor
    label="Options"
    placeholder="Type an option and press Enter"
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

const note = (text: string) => () => <Note>{text}</Note>;

type FieldRenderer = (props: ItemTypeFieldsProps) => ReactNode;

// Single source of truth for "what does this question type need to be configured?"
const FIELDS_BY_TYPE: Partial<Record<ChecklistItemType, FieldRenderer>> = {
  STANDARD: StandardFields,
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
  SIGNATURE: note('Staff sign on the screen.'),
  DUAL_SIGNATURE: note('Two people sign on the screen — usually the employee, then the supervisor.'),
  TEXT_BOX: note('Staff type a short answer.'),
  DATE_TIME: note('Staff pick a date and time.'),
};

export const ItemTypeConfigFields = (props: ItemTypeFieldsProps) => {
  const Renderer = FIELDS_BY_TYPE[props.draft.itemType];
  return Renderer ? <>{Renderer(props)}</> : null;
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
    if (min != null && max != null && min > max) return "The lowest allowed can't be more than the highest.";
  }
  if (draft.itemType === 'CASH_TALLY' && (num(draft.cashExpectedAmount) ?? 0) < 0) return "Expected amount can't be negative.";
  if (draft.itemType === 'GPS') {
    const lat = num(draft.gpsTargetLat);
    const lng = num(draft.gpsTargetLng);
    const radius = num(draft.gpsRadiusMeters);
    if ((lat == null) !== (lng == null)) return 'Enter both latitude and longitude, or remove the spot.';
    if (lat != null && (lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90.';
    if (lng != null && (lng < -180 || lng > 180)) return 'Longitude must be between -180 and 180.';
    if (radius != null && radius < 1) return 'The distance must be at least 1 metre.';
    if (radius != null && lat == null) return 'Enter the spot’s latitude and longitude, or remove the spot.';
    if (lat != null && radius == null) return 'Set how close they must be, or the location is never checked.';
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
