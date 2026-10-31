import { memo, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Camera, MapPin, PenLine, Wallet, ScanLine, ListChecks, Check, Copy, MoreVertical, Pencil, Trash2, UserPlus, FileClock, type LucideIcon } from 'lucide-react';
import { definitionState, STATE_LABEL, addPeoplePath } from './definitionState';
import { Dropdown, Loader, Switch, ChecklistProgressBar, DepartmentChip, ENTITY_CARD_CLASS, StateChip, formatWeekdays } from '../../../components';
import { IconChip } from '../../../components/iconChip';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { RECURRENCE_LABEL, smallRateToneClass, smallInverseRateToneClass, rateBarClass, formatDate, orgDayKey, plural } from '../checklistDisplay';
import { useSetChecklistDefinitionActiveMutation, useDeleteChecklistDefinitionMutation } from '../hook';
import { useAuth } from '../../../context/AuthContext';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';
  const confirm = useConfirm();
  const setActiveMutation = useSetChecklistDefinitionActiveMutation();
  const deleteMutation = useDeleteChecklistDefinitionMutation();

  const Icon = CHECKLIST_ICON_MAP[definition.icon];
  const tags = useMemo(() => cardTags(definition), [definition]);
  const daysLabel = definition.recurrence === 'DAILY' ? formatWeekdays(definition.activeWeekdays) : null;
  const { id, name, completionRate, qualityRate, issueRate } = definition;
  const state = definitionState(definition);
  const startsLater = startsAfterToday(definition.startDate);
  const ResponseIcon = RESPONSE_MODE_ICON[definition.responseMode];

  const handleToggleSelected = useCallback(() => onToggleSelected?.(id), [onToggleSelected, id]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      description: 'This checklist and every run tied to it will disappear from the app: My Checklists, Compliance, the Dashboard, everywhere.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(id);
  };

  const shownDepartments = definition.departmentNames.slice(0, 2);
  const moreDepartments = definition.departmentNames.length - shownDepartments.length;
  const meta = [RECURRENCE_LABEL[definition.recurrence], daysLabel, plural(definition.storeIds.length, 'store'), plural(definition.items.length, 'question')]
    .filter(Boolean)
    .join(' · ');
  const hasRuns = completionRate !== null;
  const headline = definition.currentRate ?? completionRate;

  return (
    <article
      className={cn(
        ENTITY_CARD_CLASS,
        'gap-4 justify-start',
        selected && 'border-primary-500 hover:border-primary-500 bg-primary-500/5',
        deleteMutation.isPending && 'opacity-50 pointer-events-none',
      )}
    >
      <div className="flex items-start justify-between gap-3">
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

        {selectionMode ? null : canManage ? (
          <div className="relative z-10 flex items-center justify-end gap-1 min-w-0">
            {state === 'draft' ? (
              <div className="flex items-center gap-2 min-h-11 sm:min-h-9">
                <button
                  type="button"
                  onClick={() => navigate(addPeoplePath(id))}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap h-9 pointer-coarse:h-11 px-3 rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-primary-300 hover:text-primary-700 dark:hover:text-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
                >
                  <UserPlus className="size-3.5" aria-hidden />
                  Add people
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 min-h-11 sm:min-h-9 pl-1 pr-1 cursor-pointer">
                <StateChip active={definition.isActive} label={STATE_LABEL[state]} className="max-sm:hidden" />
                {setActiveMutation.isPending ? (
                  <span className="flex h-6 w-11 items-center justify-center"><Loader size="sm" variant="slate" className="size-4" /></span>
                ) : (
                  <Switch
                    checked={definition.isActive}
                    onChange={(next) => setActiveMutation.mutate({ id, isActive: next })}
                  />
                )}
                <span className="sr-only">{definition.isActive ? 'Pause' : 'Resume'} {name}</span>
              </label>
            )}
            <Dropdown
              align="end"
              items={[
                { label: 'Edit in builder', icon: Pencil, onClick: () => navigate(`/admin/scheduled-checklists/builder/${id}`) },
                { label: 'Duplicate', icon: Copy, onClick: () => navigate(`/admin/scheduled-checklists/builder?copyFrom=${id}`) },
                ...(user?.role === 'ADMIN' ? [{ label: 'Delete', icon: Trash2, variant: 'destructive' as const, separatorBefore: true, onClick: handleDelete }] : []),
              ]}
              trigger={
                <button
                  type="button"
                  aria-label={`More actions for ${name}`}
                  disabled={deleteMutation.isPending}
                  className="flex items-center justify-center size-11 sm:size-9 shrink-0 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
                >
                  <MoreVertical className="size-4" strokeWidth={2.25} aria-hidden />
                </button>
              }
            />
          </div>
        ) : (
          state === 'draft'
            ? <IconChip icon={FileClock} tone="bg-warning" label="Draft" labelClassName="text-warning" />
            : <StateChip active={definition.isActive} label={STATE_LABEL[state]} />
        )}
      </div>

      <div className="flex flex-col gap-1 min-w-0">
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
        <div className="flex flex-wrap gap-1.5">
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
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="contents">
              <IconChip icon={TAG_ICON_BY_LABEL[tag] ?? ListChecks} tone="bg-text-muted" label={tag} />
            </li>
          ))}
        </ul>
      )}

      {hasRuns ? (
        <div className="flex flex-col gap-3 pt-3.5 mt-auto border-t border-border/60">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <div className="flex flex-col gap-0.5">
              <span className="t-meta font-display font-medium text-text-muted">
                {definition.currentRate !== null ? (definition.recurrence === 'DAILY' ? 'Today' : 'This run') : 'All time'}
              </span>
              <span className={cn('text-2xl font-display font-bold leading-none tabular-nums', headline === 100 ? 'text-success' : 'text-text')}>
                {headline}%
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
        <p className="mt-auto pt-3.5 border-t border-border/60 t-meta font-display text-text-muted">
          {startsLater ? `Starts ${formatDate(definition.startDate)}` : 'No runs yet'}
        </p>
      )}
    </article>
  );
});

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="t-meta font-display text-text-muted">{label}</span>
    <span className={cn('text-sm font-display font-bold tabular-nums', tone)}>{value}%</span>
  </div>
);
