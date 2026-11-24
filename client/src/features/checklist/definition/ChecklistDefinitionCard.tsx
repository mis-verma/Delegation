import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { Camera, MapPin, PenLine, Wallet, ScanLine, ListChecks, Check, FileClock, type LucideIcon } from 'lucide-react';
import { definitionState } from './definitionState';
import { ChecklistProgressBar, DepartmentChip, ENTITY_CARD_CLASS } from '../../../components';
import { IconChip } from '../../../components/iconChip';
import { cn } from '@/lib/utils';
import { smallRateToneClass, smallInverseRateToneClass, rateBarClass, formatDate, orgDayKey, plural } from '../checklistDisplay';
import { DefinitionActions } from './DefinitionActions';
import { useDefinitionDelete } from './useDefinitionDelete';
import { scheduleLabel } from './scheduleLabel';
import { CHECKLIST_ICON_MAP } from './checklistIconMap';
import { ChecklistIconTile } from './ChecklistIconTile';
import { RESPONSE_MODE_ICON, RESPONSE_MODE_LABEL } from './form/formConstants';
import type { ChecklistDefinition, ChecklistItemType } from '../../../api/checklistDefinitions';

interface ChecklistDefinitionCardProps {
  definition: ChecklistDefinition;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
}

const TAG_BY_ITEM_TYPE: Partial<Record<ChecklistItemType, string>> = {
  GPS: 'GPS',
  SIGNATURE: 'Signature',
  DUAL_SIGNATURE: 'Dual signature',
  CASH_TALLY: 'Cash tally',
  RATING: 'Rating',
  QR_SCAN: 'QR scan',
};

const TAG_ICON_BY_LABEL: Record<string, LucideIcon> = {
  'Photo proof': Camera,
  GPS: MapPin,
  Signature: PenLine,
  'Dual signature': PenLine,
  'Cash tally': Wallet,
  'QR scan': ScanLine,
};

const startsAfterToday = (startDate: string) => orgDayKey(new Date(startDate).getTime()) > orgDayKey(Date.now());

const cardTags = (definition: ChecklistDefinition) => {
  const tags: string[] = [];
  if (definition.items.some(i => i.requiredImageCount > 0)) tags.push('Photo proof');
  for (const [itemType, label] of Object.entries(TAG_BY_ITEM_TYPE)) {
    if (definition.items.some(i => i.itemType === itemType)) tags.push(label);
  }
  return tags;
};

const TITLE_CLASS = 'font-display text-base font-bold text-text leading-snug line-clamp-2';

const STRETCH_CLASS =
  'text-left outline-none cursor-pointer after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/40';

export const ChecklistDefinitionCard = memo(function ChecklistDefinitionCard({
  definition,
  selectionMode = false,
  selected = false,
  onToggleSelected,
}: ChecklistDefinitionCardProps) {
  const { remove, isDeleting } = useDefinitionDelete(definition);

  const Icon = CHECKLIST_ICON_MAP[definition.icon];
  const tags = useMemo(() => cardTags(definition), [definition]);
  const { id, name, completionRate, qualityRate, issueRate } = definition;
  const state = definitionState(definition);
  const startsLater = startsAfterToday(definition.startDate);
  const ResponseIcon = RESPONSE_MODE_ICON[definition.responseMode];

  const handleToggleSelected = useCallback(() => onToggleSelected?.(id), [onToggleSelected, id]);

  const shownDepartments = definition.departmentNames.slice(0, 2);
  const moreDepartments = definition.departmentNames.length - shownDepartments.length;
  const meta = [scheduleLabel(definition), plural(definition.storeIds.length, 'store'), plural(definition.items.length, 'question')]
    .filter(Boolean)
    .join(' · ');
  const hasRuns = completionRate !== null;
  const headline = definition.currentRate ?? completionRate;

  return (
    <article
      className={cn(
        ENTITY_CARD_CLASS,
        'gap-4 justify-start',
        'bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        'relative overflow-hidden',
        selected && 'border-primary-500 hover:border-primary-500 bg-primary-500/5',
        isDeleting && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Subtle gradient overlay at the top of the card */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-100/40 to-transparent dark:from-slate-700/20 dark:to-transparent rounded-t-2xl" aria-hidden />

      <div className="relative flex items-start justify-between gap-3">
        {selectionMode ? (
          <span
            aria-hidden
            className={cn(
              'flex items-center justify-center size-10 rounded-xl border-2 shrink-0 transition-colors duration-150',
              selected ? 'bg-primary-600 border-primary-600 text-white' : 'border-border-hover text-transparent',
            )}
          >
            <Check size={16} strokeWidth={3} />
          </span>
        ) : (
          <ChecklistIconTile icon={Icon} name={name} />
        )}

        {selectionMode ? null : <DefinitionActions definition={definition} onDelete={() => { void remove(); }} deleting={isDeleting} />}
      </div>

      <div className="relative flex flex-col gap-1 min-w-0">
        <h3 className="min-w-0">
          {selectionMode ? (
            <button type="button" aria-pressed={selected} onClick={handleToggleSelected} className={cn(TITLE_CLASS, STRETCH_CLASS)}>
              {name}
            </button>
          ) : (
            <Link to={`/admin/scheduled-checklists/${id}`} className={cn(TITLE_CLASS, STRETCH_CLASS, 'block')}>
              {name}
            </Link>
          )}
        </h3>
        <p className="t-meta font-display text-text-muted leading-snug">{meta}</p>
      </div>

      {(shownDepartments.length > 0 || definition.responseMode !== 'SHARED' || definition.assigneeIds.length === 0) && (
        <div className="relative flex flex-wrap gap-1.5">
          {definition.assigneeIds.length === 0 && (
            <IconChip icon={FileClock} tone="bg-warning" label={state === 'draft' ? 'Draft, nobody assigned' : 'Nobody assigned'} labelClassName="text-warning" title="Saved as a draft. Add the people and it goes live." />
          )}
          {shownDepartments.map((departmentName) => <DepartmentChip key={departmentName} name={departmentName} />)}
          {moreDepartments > 0 && <IconChip icon={false} label={`+${moreDepartments} more`} />}
          {definition.responseMode !== 'SHARED' && (
            <IconChip icon={ResponseIcon} tone="bg-primary-600" label={RESPONSE_MODE_LABEL[definition.responseMode]} />
          )}
        </div>
      )}

      {tags.length > 0 && (
        <ul className="relative flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag} className="contents">
              <IconChip icon={TAG_ICON_BY_LABEL[tag] ?? ListChecks} tone="bg-text-muted" label={tag} />
            </li>
          ))}
        </ul>
      )}

      {hasRuns ? (
        <div className="relative flex flex-col gap-3.5 pt-4 mt-auto border-t border-slate-200/70 dark:border-slate-700/50">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="t-meta font-display font-medium text-text-muted tracking-wide">
                {definition.currentRate !== null ? (definition.recurrence === 'DAILY' ? 'Today' : 'This run') : 'All time'}
              </span>
              <span className={cn('text-3xl font-display font-extrabold leading-none tabular-nums tracking-tight', headline === 100 ? 'text-success' : 'text-text')}>
                {headline}%
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {definition.currentRate !== null && (
                <Stat label="All time" value={completionRate} tone={smallRateToneClass(completionRate)} />
              )}
              {qualityRate !== null && <Stat label="Photo proof" value={qualityRate} tone={smallRateToneClass(qualityRate)} />}
              {issueRate !== null && issueRate > 0 && <Stat label="Flagged" value={issueRate} tone={smallInverseRateToneClass(issueRate)} />}
            </div>
          </div>
          {definition.currentRate !== null ? (
            <ChecklistProgressBar done={definition.currentRate} total={100} bare thin />
          ) : (
            <div className="h-1.5 w-full rounded-full bg-surface-hover overflow-hidden">
              <div
                className={cn('h-full w-full rounded-full origin-left transition-transform duration-500 ease-out', rateBarClass(completionRate))}
                style={{ transform: `scaleX(${completionRate / 100})` }}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="relative mt-auto pt-4 border-t border-slate-200/70 dark:border-slate-700/50 t-meta font-display text-text-muted">
          {startsLater ? `Starts ${formatDate(definition.startDate)}` : 'No runs yet'}
        </p>
      )}
    </article>
  );
});

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="t-meta font-display text-text-muted tracking-wide">{label}</span>
    <span className={cn('text-sm font-display font-bold tabular-nums', tone)}>{value}%</span>
  </div>
);
