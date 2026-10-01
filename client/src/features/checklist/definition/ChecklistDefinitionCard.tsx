import { useNavigate } from 'react-router';
import { Camera, MapPin, PenLine, Wallet, ScanLine, Repeat, CalendarDays, Store, ListChecks, Check, type LucideIcon } from 'lucide-react';
import { EntityIconTile, StatusPill, EntityCardActions, formatWeekdays } from '../../../components';
import { IconChip } from '../../../components/iconChip';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/confirmDialog';
import { RECURRENCE_LABEL, rateToneClass, rateBarClass, inverseRateToneClass, formatDate } from '../checklistDisplay';
import { useSetChecklistDefinitionActiveMutation, useDeleteChecklistDefinitionMutation } from '../hook';
import { useAuth } from '../../../context/AuthContext';
import { CHECKLIST_ICON_MAP } from './checklistIconMap';
import type { ChecklistDefinition, ChecklistItemType } from '../../../api/checklistDefinitions';

interface ChecklistDefinitionCardProps {
  definition: ChecklistDefinition;
  /** Bulk-select mode (ADMIN/PC only, toggled from the grid) — while on, the whole card selects
   *  instead of opening, and the pause/edit/delete actions step aside for a checkbox so a click
   *  in this mode can't accidentally trigger one of those instead. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
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

const cardTags = (definition: ChecklistDefinition) => {
  const tags: string[] = [];
  if (definition.items.some(i => i.requiredImageCount > 0)) tags.push('Photo proof');
  for (const [itemType, label] of Object.entries(TAG_BY_ITEM_TYPE)) {
    if (definition.items.some(i => i.itemType === itemType)) tags.push(label);
  }
  return tags;
};

// Card in the Templates grid — mirrors the reference design's icon/status/tag-chip/footer layout.
// The status pill and edit/delete actions used to be entirely read-only/click-through-only here —
// useSetChecklistDefinitionActiveMutation and useDeleteChecklistDefinitionMutation already existed
// in hook.ts but weren't wired into any component anywhere in the app, so pausing or deleting a
// checklist had no UI path at all. Now built from the same EntityIconTile/StatusPill/
// EntityCardActions kit the Users/Departments/Stores cards use, so pause and delete work right from
// the grid without opening the detail page — while keeping this card's own richer content
// (recurrence, tags, completion bars, footer stats) that a plain EntityCard doesn't have a slot for.
export const ChecklistDefinitionCard = ({ definition, selectionMode = false, selected = false, onToggleSelected }: ChecklistDefinitionCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const confirm = useConfirm();
  const setActiveMutation = useSetChecklistDefinitionActiveMutation();
  const deleteMutation = useDeleteChecklistDefinitionMutation();

  const Icon = CHECKLIST_ICON_MAP[definition.icon];
  const tags = cardTags(definition);
  // Working days, not the retired role label (a made-up role that assigned nobody).
  const daysLabel = definition.recurrence === 'DAILY' ? formatWeekdays(definition.activeWeekdays) : null;
  const { completionRate, qualityRate, issueRate } = definition;
  const startsLater = startsAfterToday(definition.startDate);

  const openDetail = () => navigate(`/admin/scheduled-checklists/${definition.id}`);
  const handleCardActivate = () => (selectionMode ? onToggleSelected?.() : openDetail());

  const handleDelete = async () => {
    // This used to claim runs/submissions/photos are erased "for good" — they aren't (it's a soft
    // delete, kept for audit history) — but they do now disappear from every view (My Checklists,
    // Compliance, Dashboard, the Verification queue) the moment this happens, which is what this
    // copy actually promises.
    const ok = await confirm({
      title: `Delete "${definition.name}"?`,
      description: 'This checklist and every run tied to it will disappear from the app — My Checklists, Compliance, the Dashboard, everywhere.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(definition.id);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleCardActivate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardActivate(); } }}
      aria-pressed={selectionMode ? selected : undefined}
      className={`flex flex-col gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border bg-surface transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
        selected ? 'border-primary-500 bg-primary-500/5' : 'border-border hover:border-border-hover'
      } ${deleteMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        {selectionMode ? (
          <span
            className={`flex items-center justify-center size-9 rounded-lg border-2 shrink-0 transition-colors duration-150 ${
              selected ? 'bg-primary-600 border-primary-600 text-white' : 'border-border-hover text-transparent'
            }`}
          >
            <Check size={16} strokeWidth={3} />
          </span>
        ) : (
          <EntityIconTile icon={Icon} tone="coral" />
        )}

        {/* Stops the click from also bubbling up to the card's own openDetail — same pattern
            TaskCard.tsx uses for its own inline actions inside an otherwise-clickable card.
            Hidden entirely in selection mode so a stray tap can't pause/edit/delete instead of
            just selecting the card. */}
        {selectionMode ? null : isAdmin ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <StatusPill
              active={definition.isActive}
              isUpdating={setActiveMutation.isPending}
              onToggle={() => setActiveMutation.mutate({ id: definition.id, isActive: !definition.isActive })}
              ariaLabel={`${definition.isActive ? 'Pause' : 'Resume'} ${definition.name}`}
            />
            <EntityCardActions
              onEdit={() => navigate(`/admin/scheduled-checklists/builder/${definition.id}`)}
              onDuplicate={() => navigate(`/admin/scheduled-checklists/builder?copyFrom=${definition.id}`)}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
              editLabel={`Edit ${definition.name} in builder`}
              duplicateLabel={`Duplicate ${definition.name}`}
              deleteLabel={`Delete ${definition.name}`}
            />
          </div>
        ) : (
          <Badge variant={definition.isActive ? 'success' : 'neutral'}>
            {definition.isActive ? 'Active' : 'Paused'}
          </Badge>
        )}
      </div>

      <h3 className="font-display text-base font-bold text-text leading-snug line-clamp-2">{definition.name}</h3>

      {/* Same IconChip row as delegation and ticket cards: cadence, working days, reach, size,
          then whatever proof the questions ask for. */}
      <div className="flex flex-wrap gap-1.5">
        <IconChip icon={Repeat} tone="bg-primary-600" label={RECURRENCE_LABEL[definition.recurrence]} />
        {daysLabel && <IconChip icon={CalendarDays} tone="bg-coral-500" label={daysLabel} />}
        <IconChip icon={Store} tone="bg-success" label={`${definition.storeIds.length} store${definition.storeIds.length !== 1 ? 's' : ''}`} />
        <IconChip icon={ListChecks} tone="bg-info" label={`${definition.items.length} question${definition.items.length !== 1 ? 's' : ''}`} />
        {tags.map((tag) => (
          <IconChip key={tag} icon={TAG_ICON_BY_LABEL[tag] ?? ListChecks} tone="bg-text-muted" label={tag} />
        ))}
      </div>

      {completionRate !== null ? (
        <div className="flex flex-col gap-1.5">
          {/* Right now: how far today's run (this week's, for a weekly checklist) has got. Green
              once everything's done, otherwise neutral, since a half-filled run that isn't due yet
              is normal and shouldn't read as a problem. */}
          {definition.currentRate !== null && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between font-display">
                <span className="text-xs font-medium text-text-secondary">{definition.recurrence === 'DAILY' ? 'Today' : 'This run'}</span>
                <span className={`text-base font-bold tabular-nums ${definition.currentRate === 100 ? 'text-success' : 'text-primary-600 dark:text-primary-400'}`}>
                  {definition.currentRate}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-hover overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${definition.currentRate === 100 ? 'bg-success' : 'bg-primary-500'}`}
                  style={{ width: `${definition.currentRate}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] font-display font-medium">
            <span className="text-text-muted">All time</span>
            <span className={rateToneClass(completionRate)}>{completionRate}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-hover overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${rateBarClass(completionRate)}`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
          {qualityRate !== null && (
            <div className="flex items-center justify-between text-[11px] font-display">
              <span className="text-text-muted">Photo compliance</span>
              <span className={`font-medium ${rateToneClass(qualityRate)}`}>{qualityRate}%</span>
            </div>
          )}
          {issueRate !== null && issueRate > 0 && (
            <div className="flex items-center justify-between text-[11px] font-display">
              <span className="text-text-muted">Flagged answers</span>
              <span className={`font-medium ${inverseRateToneClass(issueRate)}`}>{issueRate}%</span>
            </div>
          )}
        </div>
      ) : (
        // A future start date is the most common reason for "no runs" — say so right here.
        <p className="mt-auto text-xs font-display text-text-muted">
          {startsLater ? `Starts ${formatDate(definition.startDate)}` : 'No runs yet'}
        </p>
      )}
    </article>
  );
};
