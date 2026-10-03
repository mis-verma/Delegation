import { memo, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Camera, MapPin, PenLine, Wallet, ScanLine, ListChecks, Check, type LucideIcon } from 'lucide-react';
import { EntityIconTile, StatusPill, EntityCardActions, ChecklistProgressBar, DepartmentChip, ENTITY_CARD_CLASS, formatWeekdays } from '../../../components';
import { IconChip } from '../../../components/iconChip';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { RECURRENCE_LABEL, rateToneClass, rateBarClass, inverseRateToneClass, formatDate } from '../checklistDisplay';
import { useSetChecklistDefinitionActiveMutation, useDeleteChecklistDefinitionMutation } from '../hook';
import { useAuth } from '../../../context/AuthContext';
import { CHECKLIST_ICON_MAP } from './checklistIconMap';
import { RESPONSE_MODE_ICON, RESPONSE_MODE_LABEL } from './form/formConstants';
import type { ChecklistDefinition, ChecklistItemType } from '../../../api/checklistDefinitions';

interface ChecklistDefinitionCardProps {
  definition: ChecklistDefinition;
  /** Bulk-select mode (ADMIN/PC only, toggled from the grid) — while on, the whole card selects
   *  instead of opening, and the pause/edit/delete actions step aside for a checkbox so a click
   *  in this mode can't accidentally trigger one of those instead. */
  selectionMode?: boolean;
  selected?: boolean;
  /** Takes the definition id so the grid can pass one stable callback to every card (the card is
   *  memoized; an inline arrow per card would defeat that). */
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

// Org-local (India) calendar days, same as the generator — true when the first run is still ahead.
const dayKey = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const startsAfterToday = (startDate: string) => dayKey(new Date(startDate).getTime()) > dayKey(Date.now());

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const cardTags = (definition: ChecklistDefinition) => {
  const tags: string[] = [];
  if (definition.items.some(i => i.requiredImageCount > 0)) tags.push('Photo proof');
  for (const [itemType, label] of Object.entries(TAG_BY_ITEM_TYPE)) {
    if (definition.items.some(i => i.itemType === itemType)) tags.push(label);
  }
  return tags;
};

const TITLE_CLASS = 'font-display text-base font-bold text-text leading-snug line-clamp-2';

// Stretched-link pattern: the title is the card's one real link (or, in select mode, its one real
// toggle button) and its ::after covers the whole card, so the card is clickable with the mouse and
// reachable by keyboard without wrapping the Pause/Edit/Delete buttons in another interactive
// element. The actions sit above it (relative z-10).
const STRETCH_CLASS =
  'text-left outline-none cursor-pointer after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/40';

// Card in the Templates grid — built from the same EntityIconTile/StatusPill/EntityCardActions kit
// the Users/Departments/Stores cards use, so pause and delete work right from the grid without
// opening the detail page, while keeping this card's own richer content (recurrence, tags,
// completion bars) that a plain EntityCard has no slot for.
export const ChecklistDefinitionCard = memo(function ChecklistDefinitionCard({
  definition,
  selectionMode = false,
  selected = false,
  onToggleSelected,
}: ChecklistDefinitionCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const confirm = useConfirm();
  const setActiveMutation = useSetChecklistDefinitionActiveMutation();
  const deleteMutation = useDeleteChecklistDefinitionMutation();

  const Icon = CHECKLIST_ICON_MAP[definition.icon];
  const tags = useMemo(() => cardTags(definition), [definition]);
  // Working days, not the retired role label (a made-up role that assigned nobody).
  const daysLabel = definition.recurrence === 'DAILY' ? formatWeekdays(definition.activeWeekdays) : null;
  const { id, name, completionRate, qualityRate, issueRate } = definition;
  const startsLater = startsAfterToday(definition.startDate);
  const ResponseIcon = RESPONSE_MODE_ICON[definition.responseMode];

  const handleToggleSelected = useCallback(() => onToggleSelected?.(id), [onToggleSelected, id]);

  const handleDelete = async () => {
    // Soft delete (kept for audit history), but the checklist and its runs disappear from every
    // view the moment this happens, which is what this copy promises.
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
          <EntityIconTile icon={Icon} tone="coral" />
        )}

        {/* Sits above the stretched title link (z-10), so these stay individually clickable and
            reachable by keyboard. Hidden entirely in selection mode so a stray tap cannot
            pause/edit/delete instead of just selecting the card. */}
        {selectionMode ? null : isAdmin ? (
          <div className="relative z-10 flex items-center gap-1 shrink-0">
            <StatusPill
              active={definition.isActive}
              isUpdating={setActiveMutation.isPending}
              onToggle={() => setActiveMutation.mutate({ id, isActive: !definition.isActive })}
              ariaLabel={`${definition.isActive ? 'Pause' : 'Resume'} ${name}`}
            />
            <EntityCardActions
              onEdit={() => navigate(`/admin/scheduled-checklists/builder/${id}`)}
              onDuplicate={() => navigate(`/admin/scheduled-checklists/builder?copyFrom=${id}`)}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
              editLabel={`Edit ${name} in builder`}
              duplicateLabel={`Duplicate ${name}`}
              deleteLabel={`Delete ${name}`}
            />
          </div>
        ) : (
          <Badge variant={definition.isActive ? 'success' : 'neutral'}>
            {definition.isActive ? 'Active' : 'Paused'}
          </Badge>
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
        <p className="text-xs font-display text-text-muted leading-snug">{meta}</p>
      </div>

      {/* Who it is for: the departments of the people assigned, then (only when it is not one shared
          checklist) who answers. */}
      {(shownDepartments.length > 0 || definition.responseMode !== 'SHARED') && (
        <div className="flex flex-wrap gap-1.5">
          {shownDepartments.map((departmentName) => <DepartmentChip key={departmentName} name={departmentName} />)}
          {moreDepartments > 0 && <IconChip icon={false} label={`+${moreDepartments} more`} />}
          {definition.responseMode !== 'SHARED' && (
            <IconChip icon={ResponseIcon} tone="bg-primary-600" label={RESPONSE_MODE_LABEL[definition.responseMode]} />
          )}
        </div>
      )}

      {hasRuns ? (
        <div className="flex flex-col gap-3 pt-3.5 border-t border-border/60">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-display font-medium text-text-muted">
                {definition.currentRate !== null ? (definition.recurrence === 'DAILY' ? 'Today' : 'This run') : 'All time'}
              </span>
              <span className={cn('text-2xl font-display font-bold leading-none tabular-nums', headline === 100 ? 'text-success' : 'text-text')}>
                {headline}%
              </span>
            </div>
            <div className="flex items-center gap-4 text-right">
              {definition.currentRate !== null && (
                <Stat label="All time" value={completionRate} tone={rateToneClass(completionRate)} />
              )}
              {qualityRate !== null && <Stat label="Photo proof" value={qualityRate} tone={rateToneClass(qualityRate)} />}
              {issueRate !== null && issueRate > 0 && <Stat label="Flagged" value={issueRate} tone={inverseRateToneClass(issueRate)} />}
            </div>
          </div>
          {/* Today's fill is plain progress (green once done); the all-time bar is coloured by how
              good the rate is, so it stays a hand-built track. */}
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
        // A future start date is the most common reason for "no runs": say so right here.
        <p className="mt-auto pt-3.5 border-t border-border/60 text-xs font-display text-text-muted">
          {startsLater ? `Starts ${formatDate(definition.startDate)}` : 'No runs yet'}
        </p>
      )}

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-display font-medium text-text-muted">
          {tags.map((tag) => {
            const TagIcon = TAG_ICON_BY_LABEL[tag] ?? ListChecks;
            return (
              <li key={tag} className="inline-flex items-center gap-1">
                <TagIcon size={12} aria-hidden />
                {tag}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
});

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] font-display text-text-muted">{label}</span>
    <span className={cn('text-sm font-display font-bold tabular-nums', tone)}>{value}%</span>
  </div>
);
