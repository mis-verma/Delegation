import type { ReactNode } from 'react';
import { Video, MapPin, Info, Star, X } from 'lucide-react';
import { AccessoriesListEditor, AddChip, Button, Input, Switch, ToggleChip } from '../../../../components';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserBulkPicker } from '../../UserBulkPicker';
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
// One label style, one input style, one switch: so every question type's settings read as the
// same form rather than a different mini-widget per type.

const LABEL = 'text-[11px] font-display font-medium text-text-muted';
// The shared Input is a tall (h-12) rounded-xl field. These settings sit inside a question card, so
// they use a compact 36px field (44px on touch) and keep the caption style used by the other labels.
const INPUT = 'h-11 sm:h-9 rounded-lg px-3 font-display tabular-nums';
const INPUT_LABEL = 'font-display font-medium tracking-normal px-0';

// Per-question ids: several questions are open at once, so a fixed id ("number-min") made every
// label focus the first question's input.
const fid = (draft: ItemDraft, name: string) => `${name}-${draft.key}`;

// The shared Switch is just the control, so it gets a clickable label (and a 44px touch row) here.
const SwitchField = ({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div className="flex items-center gap-2.5 w-fit">
    <Switch id={id} checked={checked} onChange={onChange} />
    <label htmlFor={id} className="flex flex-col justify-center min-h-11 sm:min-h-0 cursor-pointer">
      <span className="text-[13px] font-display font-medium text-text">{label}</span>
      {hint && <span className="text-[11px] font-display text-text-muted">{hint}</span>}
    </label>
  </div>
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
      <Input
        id={fid(draft, 'min')}
        label={`Minimum ${noun}`}
        labelClassName={INPUT_LABEL}
        containerClassName="w-24"
        className={INPUT}
        type="number"
        inputMode="numeric"
        min={noun === 'videos' ? 1 : 0}
        value={draft.requiredImageCount}
        onChange={(e) => onChange({ requiredImageCount: e.target.value })}
      />
      <Input
        id={fid(draft, 'max')}
        label="Maximum"
        labelClassName={INPUT_LABEL}
        containerClassName="w-24"
        className={INPUT}
        type="number"
        inputMode="numeric"
        min={0}
        value={draft.maxImageCount}
        onChange={(e) => onChange({ maxImageCount: e.target.value })}
        placeholder="No limit"
      />
    </div>
    <SwitchField
      id={fid(draft, 'live')}
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
    <div className="w-fit">
      <AddChip onClick={() => onChange({ requiredImageCount: '1' })}>Also ask for a photo</AddChip>
    </div>
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
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Who gets audited?</span>
        {draft.auditUserIds.length > 0 && (
          <span className="text-[11px] font-display font-medium text-text-muted">
            {draft.auditUserIds.length} {draft.auditUserIds.length === 1 ? 'person' : 'people'}
          </span>
        )}
      </div>
      {/* Same bulk-pick UI as the Assign step: a real-world audit (e.g. a uniform/ID check) often
          covers a whole team, not one or two people picked by hand. Whoever's assigned to run this
          checklist works through everyone picked here themselves; this isn't a list of separate
          self-reporters. */}
      <UserBulkPicker
        storeIds={storeIds ?? []}
        selected={draft.auditUserIds}
        onChange={(ids) => onChange({ auditUserIds: ids })}
        everyoneLabel="Select everyone at this store"
      />
    </div>
    <AccessoriesListEditor
      label="Things to check (everyone)"
      placeholder="e.g. ID card, uniform"
      accessories={draft.accessories}
      onChange={(accessories) => onChange({ accessories })}
    />
    {/* Uniform rules often differ by gender. A person gets the list for their gender (set on their
        user profile); when that list is empty, or their gender isn't set, they get the one above. */}
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-dashed border-border bg-surface-hover/30">
      <p className="text-[11px] font-display text-text-muted leading-relaxed">
        Different checks for women and men? Fill the lists below. Anyone whose gender isn't set, or
        whose list is empty, gets the "everyone" list.
      </p>
      <AccessoriesListEditor
        label="Female"
        placeholder="e.g. Saree or suit, bindi"
        accessories={draft.accessoriesFemale}
        onChange={(accessoriesFemale) => onChange({ accessoriesFemale })}
      />
      <AccessoriesListEditor
        label="Male"
        placeholder="e.g. Tie, formal shoes"
        accessories={draft.accessoriesMale}
        onChange={(accessoriesMale) => onChange({ accessoriesMale })}
      />
    </div>
  </div>
);

const NumberFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  const isCash = draft.itemType === 'CASH_TALLY';
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
      {isCash && (
        <Input
          id={fid(draft, 'expected')}
          label="Expected amount"
          labelClassName={INPUT_LABEL}
          containerClassName="col-span-2 sm:col-span-1 sm:w-36"
          className={INPUT}
          type="number"
          inputMode="decimal"
          min={0}
          value={draft.cashExpectedAmount}
          onChange={(e) => onChange({ cashExpectedAmount: e.target.value })}
          placeholder="e.g. 5000"
        />
      )}
      <Input
        id={fid(draft, 'unit')}
        label="Unit"
        labelClassName={INPUT_LABEL}
        containerClassName="sm:w-24"
        className={INPUT}
        value={draft.numberEntryUnit}
        onChange={(e) => onChange({ numberEntryUnit: e.target.value })}
        placeholder={isCash ? '₹' : 'kg, °C, pcs'}
      />
      <Input
        id={fid(draft, 'nmin')}
        label="Lowest allowed"
        labelClassName={INPUT_LABEL}
        containerClassName="sm:w-28"
        className={INPUT}
        type="number"
        inputMode="decimal"
        value={draft.numberEntryMin}
        onChange={(e) => onChange({ numberEntryMin: e.target.value })}
        placeholder="Any"
      />
      <Input
        id={fid(draft, 'nmax')}
        label="Highest allowed"
        labelClassName={INPUT_LABEL}
        containerClassName="sm:w-28"
        className={INPUT}
        type="number"
        inputMode="decimal"
        value={draft.numberEntryMax}
        onChange={(e) => onChange({ numberEntryMax: e.target.value })}
        placeholder="Any"
      />
      {isCash && (
        <p className="col-span-2 text-[11px] font-display text-text-muted sm:basis-full">
          If the count doesn’t match, staff must give a reason.
        </p>
      )}
    </div>
  );
};

const RATING_SCALES = ['3', '5', '10'];

// Radix tabs give the radio-style arrow-key behaviour for free; the active segment is a border
// change rather than the tabs' default drop shadow.
const RatingFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <Tabs value={draft.ratingScale} onValueChange={(ratingScale) => onChange({ ratingScale })} className="w-fit gap-1.5">
    <span className={LABEL}>Out of</span>
    <TabsList aria-label="Rating scale" className="rounded-full p-0.5 gap-0.5">
      {RATING_SCALES.map((scale) => {
        const selected = draft.ratingScale === scale;
        return (
          <TabsTrigger
            key={scale}
            value={scale}
            className="min-h-11 sm:min-h-8 py-0 px-3.5 rounded-full text-xs font-semibold border border-transparent data-[state=active]:border-border data-[state=active]:shadow-none"
          >
            <Star size={12} className={selected ? 'fill-warning text-warning' : ''} />
            {scale}
          </TabsTrigger>
        );
      })}
    </TabsList>
  </Tabs>
);

const GpsFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  const hasTarget = draft.gpsTargetLat.trim() !== '' || draft.gpsTargetLng.trim() !== '' || draft.gpsRadiusMeters.trim() !== '';
  if (!hasTarget) {
    return (
      <div className="flex flex-col gap-2">
        <Note icon={MapPin}>Records where staff are when they answer.</Note>
        <div className="w-fit">
          <AddChip onClick={() => onChange({ gpsRadiusMeters: '100' })}>Only accept near a set spot</AddChip>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
        <Input
          id={fid(draft, 'lat')}
          label="Latitude"
          labelClassName={INPUT_LABEL}
          containerClassName="sm:w-32"
          className={INPUT}
          type="number"
          step="any"
          inputMode="decimal"
          value={draft.gpsTargetLat}
          onChange={(e) => onChange({ gpsTargetLat: e.target.value })}
          placeholder="30.9045"
        />
        <Input
          id={fid(draft, 'lng')}
          label="Longitude"
          labelClassName={INPUT_LABEL}
          containerClassName="sm:w-32"
          className={INPUT}
          type="number"
          step="any"
          inputMode="decimal"
          value={draft.gpsTargetLng}
          onChange={(e) => onChange({ gpsTargetLng: e.target.value })}
          placeholder="77.0967"
        />
        <Input
          id={fid(draft, 'radius')}
          label="Within (metres)"
          labelClassName={INPUT_LABEL}
          containerClassName="sm:w-28"
          className={INPUT}
          type="number"
          min={1}
          inputMode="numeric"
          value={draft.gpsRadiusMeters}
          onChange={(e) => onChange({ gpsRadiusMeters: e.target.value })}
          placeholder="100"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ gpsTargetLat: '', gpsTargetLng: '', gpsRadiusMeters: '' })}
          className="self-end col-span-2 sm:col-span-1 hover:text-danger hover:bg-danger/10"
        >
          <X size={13} /> Remove spot
        </Button>
      </div>
      <Note icon={MapPin}>Tip: open the store in Google Maps, long-press it and copy the two numbers.</Note>
    </div>
  );
};

const QrFields = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <Input
    id={fid(draft, 'qr')}
    label="Code it must match (optional)"
    labelClassName={INPUT_LABEL}
    containerClassName="sm:max-w-sm"
    className={INPUT}
    value={draft.qrExpectedValue}
    onChange={(e) => onChange({ qrExpectedValue: e.target.value })}
    placeholder="Leave blank to accept any code"
  />
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

// ─── Acceptable answer ──────────────────────────────────────────────────────────────────────
// What counts as a GOOD answer. Scored into the checklist's compliance %, separately from whether
// the question was completed. Left empty, the question simply isn't scored.

const AcceptableFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  const { itemType, acceptableAnswers: accepted } = draft;
  let body: ReactNode;

  if (itemType === 'YES_NO' || itemType === 'PASS_FAIL') {
    const [yes, no] = itemType === 'YES_NO' ? ['Yes', 'No'] : ['Pass', 'Fail'];
    const pick = (v: 'YES' | 'NO') => onChange({ acceptableAnswers: accepted[0] === v ? [] : [v] });
    body = (
      <div className="flex flex-wrap gap-2">
        <ToggleChip tone="good" on={accepted.length === 0} onClick={() => onChange({ acceptableAnswers: [] })}>Not scored</ToggleChip>
        <ToggleChip tone="good" on={accepted[0] === 'YES'} onClick={() => pick('YES')}>{yes} is good</ToggleChip>
        <ToggleChip tone="good" on={accepted[0] === 'NO'} onClick={() => pick('NO')}>{no} is good</ToggleChip>
      </div>
    );
  } else if (itemType === 'MULTIPLE_CHOICE' || itemType === 'DROPDOWN') {
    if (draft.options.length < 2) return null;
    const toggle = (o: string) =>
      onChange({ acceptableAnswers: accepted.includes(o) ? accepted.filter(a => a !== o) : [...accepted, o] });
    body = (
      <div className="flex flex-wrap gap-2">
        {draft.options.map(o => <ToggleChip key={o} tone="good" on={accepted.includes(o)} onClick={() => toggle(o)}>{o}</ToggleChip>)}
      </div>
    );
  } else if (itemType === 'NUMBER_ENTRY' || itemType === 'RATING') {
    body = (
      <div className="flex flex-wrap items-end gap-3">
        <Input
          id={fid(draft, 'good-min')}
          label={itemType === 'RATING' ? 'Good from (stars)' : 'Good from'}
          labelClassName={INPUT_LABEL}
          containerClassName="w-28"
          className={INPUT}
          type="number"
          inputMode="decimal"
          value={draft.acceptableMin}
          onChange={(e) => onChange({ acceptableMin: e.target.value })}
          placeholder="Any"
        />
        <Input
          id={fid(draft, 'good-max')}
          label="Good up to"
          labelClassName={INPUT_LABEL}
          containerClassName="w-28"
          className={INPUT}
          type="number"
          inputMode="decimal"
          value={draft.acceptableMax}
          onChange={(e) => onChange({ acceptableMax: e.target.value })}
          placeholder="Any"
        />
      </div>
    );
  } else {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-border/50">
      <span className={LABEL}>Good answer (for the compliance %)</span>
      {body}
      <Note>Not applicable answers are never scored. Leave it unscored if any answer is fine.</Note>
    </div>
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
  DUAL_SIGNATURE: note('Two people sign on the screen, usually the employee and then the supervisor.'),
  TEXT_BOX: note('Staff type a short answer.'),
  DATE_TIME: note('Staff pick a date and time.'),
};

export const ItemTypeConfigFields = (props: ItemTypeFieldsProps) => {
  const Renderer = FIELDS_BY_TYPE[props.draft.itemType];
  return Renderer ? <>{Renderer(props)}<AcceptableFields {...props} /></> : null;
};

// The exports below are colocated with the component like ui/badge.tsx's own badgeVariants export;
// only affects Fast Refresh granularity (a full reload instead of a hot-swap when this file
// changes), not runtime correctness.
const PHOTO_TYPES: ItemDraft['itemType'][] = ['STANDARD', 'VIDEO_UPLOAD', 'AUDIT'];
const num = (v: string) => (v.trim() === '' ? null : Number(v));

// What's wrong with this question, in words an admin can act on, or null when it's ready. Mirrors
// the server's zod rules (checklistDefinition.validation.ts) so a bad setting is caught on the
// question itself instead of as a generic error at the final Save.
// eslint-disable-next-line react-refresh/only-export-components
export const itemDraftProblem = (draft: ItemDraft): string | null => {
  if (draft.label.trim().length > 191) return 'Keep the question under 191 characters.';
  if (draft.itemType === 'AUDIT' && draft.auditUserIds.length === 0) return 'Pick at least one person to audit.';
  if ((draft.itemType === 'MULTIPLE_CHOICE' || draft.itemType === 'DROPDOWN') && draft.options.length < 2) return 'Add at least two options.';
  if (PHOTO_TYPES.includes(draft.itemType)) {
    const min = num(draft.requiredImageCount) ?? 0;
    const max = num(draft.maxImageCount);
    if (draft.itemType === 'VIDEO_UPLOAD' && min < 1) return 'A video question needs at least 1 video.';
    if (max != null && min > max) return "Minimum can't be more than the maximum, or staff could never finish it.";
  }
  if (draft.itemType === 'NUMBER_ENTRY' || draft.itemType === 'CASH_TALLY') {
    const min = num(draft.numberEntryMin);
    const max = num(draft.numberEntryMax);
    if (min != null && max != null && min > max) return "The lowest allowed can't be more than the highest.";
  }
  if (draft.itemType === 'NUMBER_ENTRY' || draft.itemType === 'RATING') {
    const min = num(draft.acceptableMin);
    const max = num(draft.acceptableMax);
    if (min != null && max != null && min > max) return "The lowest good answer can't be more than the highest.";
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

// Switching an item's type used to change only `itemType`, carrying every other setting along,
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
  if (itemType !== draft.itemType) {
    patch.acceptableAnswers = [];
    patch.acceptableMin = '';
    patch.acceptableMax = '';
  }
  if (itemType !== 'YES_NO' && itemType !== 'PASS_FAIL') {
    patch.yesActions = [];
    patch.noActions = [];
  }
  return patch;
};
