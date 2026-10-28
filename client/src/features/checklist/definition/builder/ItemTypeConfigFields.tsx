import { useState, type ReactNode } from 'react';
import { Video, MapPin, Info, Star, X, AlertTriangle, Check, Flag } from 'lucide-react';
import { AccessoriesListEditor, AddChip, Button, Input, ToggleChip } from '../../../../components';
import { AuditUniformLists } from './AuditUniformLists';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserBulkPicker } from '../../UserBulkPicker';
import { ConditionalLogicPanel } from './ConditionalLogicPanel';
import { GoodAnswerPicker } from './GoodAnswerPicker';
import { PhotoRulesPanel } from './PhotoRulesPanel';
import { HiddenPeopleNotice } from './HiddenPeopleNotice';
import { peopleCount, splitByVisible } from './useStorePeople';
import { isScorableType } from '../../questionTypes/model';
import type { ChecklistItemType } from '../../../../api/checklistDefinitions';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

export interface ItemTypeFieldsProps {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  storeIds?: string[];
  validPersonIds?: ReadonlySet<string> | null;
}

const LABEL = 't-meta font-display font-medium text-text-muted';
const INPUT = 'h-11 sm:h-9 rounded-lg px-3 font-display tabular-nums';
const INPUT_LABEL = 'font-display font-medium tracking-normal px-0';

const fid = (draft: ItemDraft, name: string) => `${name}-${draft.key}`;

const Note = ({ icon: Icon = Info, children }: { icon?: typeof Info; children: ReactNode }) => (
  <p className="flex items-start gap-1.5 t-meta font-display text-text-muted leading-relaxed">
    <Icon size={13} className="shrink-0 mt-0.5 text-text-light" />
    <span>{children}</span>
  </p>
);

const StandardFields = (props: ItemTypeFieldsProps) => {
  const { draft, onChange } = props;
  if (Number(draft.requiredImageCount) > 0) return <PhotoRulesPanel draft={draft} onChange={onChange} noun="photos" removable />;
  return (
    <div className="w-fit">
      <AddChip onClick={() => onChange({ requiredImageCount: '1' })}>Also ask for a photo</AddChip>
    </div>
  );
};

const VideoFields = (props: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-2.5">
    <PhotoRulesPanel draft={props.draft} onChange={props.onChange} noun="videos" />
    <Note icon={Video}>Staff record or upload short clips. Photos aren’t accepted here.</Note>
  </div>
);

const hasNoAuditList = (d: ItemDraft) =>
  d.accessories.length === 0 && d.accessoriesFemale.length === 0 && d.accessoriesMale.length === 0
  && Object.values(d.accessoriesByType).every((list) => list.length === 0);

const AuditFields = ({ draft, onChange, storeIds, validPersonIds }: ItemTypeFieldsProps) => {
  const { shown, hidden } = splitByVisible(draft.auditUserIds, validPersonIds ?? null);
  return (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Who gets audited?</span>
        {shown.length > 0 && (
          <span className="t-meta font-display font-medium text-text-muted">
            {peopleCount(shown.length)}
          </span>
        )}
      </div>
      {hidden.length > 0 && (
        <HiddenPeopleNotice
          message={`${peopleCount(hidden.length)} ${hidden.length === 1 ? 'is' : 'are'} not in the selected stores.`}
          onRemove={() => onChange({ auditUserIds: shown })}
        />
      )}
      <UserBulkPicker
        storeIds={storeIds ?? []}
        selected={shown}
        onChange={(ids) => onChange({ auditUserIds: [...hidden, ...ids] })}
        everyoneLabel="Select everyone at this store"
      />
    </div>
    <AuditUniformLists draft={draft} onChange={onChange} />
    {hasNoAuditList(draft) && (
      <p className="flex items-center gap-1.5 t-meta font-display font-medium text-warning">
        <AlertTriangle size={13} className="shrink-0" aria-hidden />
        Nobody has anything to tick yet.
      </p>
    )}
  </div>
  );
};

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
        <p className="col-span-2 t-meta font-display text-text-muted sm:basis-full">
          If the count doesn’t match, staff must give a reason.
        </p>
      )}
    </div>
  );
};

const RATING_SCALES = ['3', '5', '10'];

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
            className="min-h-11 sm:min-h-8 py-0 px-3.5 rounded-full t-meta font-semibold border border-transparent data-[state=active]:border-border data-[state=active]:shadow-none"
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
  const [open, setOpen] = useState(hasTarget);
  if (!hasTarget && !open) {
    return (
      <div className="flex flex-col gap-2">
        <Note icon={MapPin}>Records where staff are when they answer.</Note>
        <div className="w-fit">
          <AddChip onClick={() => { setOpen(true); onChange({ gpsRadiusMeters: '100' }); }}>Only accept near a set spot</AddChip>
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
          onClick={() => { setOpen(false); onChange({ gpsTargetLat: '', gpsTargetLng: '', gpsRadiusMeters: '' }); }}
          className="h-11 sm:h-9 pointer-coarse:h-11 self-end col-span-2 sm:col-span-1 hover:text-danger hover:bg-danger/10"
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
      liveOnly={draft.requiresLivePhoto}
      onLiveOnlyChange={(live) => onChange({ requiresLivePhoto: live })}
    />
  );
};

const AcceptableFields = ({ draft, onChange }: ItemTypeFieldsProps) => {
  const { itemType, acceptableAnswers: accepted } = draft;
  let body: ReactNode;

  if (itemType === 'YES_NO' || itemType === 'PASS_FAIL') {
    const [yes, no] = itemType === 'YES_NO' ? ['Yes', 'No'] : ['Pass', 'Fail'];
    body = (
      <GoodAnswerPicker
        yes={yes}
        no={no}
        value={accepted[0] === 'YES' || accepted[0] === 'NO' ? accepted[0] : null}
        onChange={(next) => onChange({ acceptableAnswers: next ? [next] : [] })}
      />
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

const FIELDS_BY_TYPE: Record<ChecklistItemType, FieldRenderer> = {
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

const CriticalField = ({ draft, onChange }: ItemTypeFieldsProps) => (
  <div className="flex flex-col gap-1.5">
    <div className="w-fit">
      <ToggleChip on={draft.isCritical} onClick={() => onChange({ isCritical: !draft.isCritical })}>
        {draft.isCritical ? <Check size={13} strokeWidth={2.75} /> : <Flag size={13} />}
        Critical question
      </ToggleChip>
    </div>
    <span className="t-meta font-display text-text-muted">
      {isScorableType(draft.itemType)
        ? 'A bad answer counts double against compliance and is flagged to the reviewer'
        : 'Counts double if a reviewer sends it back'}
    </span>
  </div>
);

export const ItemTypeConfigFields = (props: ItemTypeFieldsProps) => {
  const Renderer = FIELDS_BY_TYPE[props.draft.itemType];
  return <>{Renderer(props)}<AcceptableFields {...props} /><CriticalField {...props} /></>;
};
