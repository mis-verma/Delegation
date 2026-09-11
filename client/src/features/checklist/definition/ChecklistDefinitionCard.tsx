import { useNavigate } from 'react-router';
import { Camera, MapPin, PenLine, Wallet, ScanLine, type LucideIcon } from 'lucide-react';
import { EntityIconTile, StatusPill, EntityCardActions } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/confirmDialog';
import { RECURRENCE_LABEL, rateToneClass, rateBarClass } from '../checklistDisplay';
import { useSetChecklistDefinitionActiveMutation, useDeleteChecklistDefinitionMutation } from '../hook';
import { useAuth } from '../../../context/AuthContext';
import { CHECKLIST_ICON_MAP } from './checklistIconMap';
import type { ChecklistDefinition, ChecklistAssigneeRole, ChecklistItemType } from '../../../api/checklistDefinitions';

interface ChecklistDefinitionCardProps {
  definition: ChecklistDefinition;
}

const ROLE_LABEL: Record<ChecklistAssigneeRole, string> = {
  STORE_MANAGER: 'Store Manager',
  FLOOR_MANAGER: 'Floor Manager',
  CASHIER: 'Cashier',
  SECURITY: 'Security',
  HOUSEKEEPING: 'Housekeeping',
  OPERATIONS: 'Operations',
};


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
export const ChecklistDefinitionCard = ({ definition }: ChecklistDefinitionCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const confirm = useConfirm();
  const setActiveMutation = useSetChecklistDefinitionActiveMutation();
  const deleteMutation = useDeleteChecklistDefinitionMutation();

  const Icon = CHECKLIST_ICON_MAP[definition.icon];
  const tags = cardTags(definition);
  const roleLabel = definition.assigneeRoles[0] ? ROLE_LABEL[definition.assigneeRoles[0]] : null;
  const { completionRate, qualityRate } = definition;

  const openDetail = () => navigate(`/admin/scheduled-checklists/${definition.id}`);

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${definition.name}"?`,
      description: 'This permanently removes the checklist and every instance, submission, and photo ever generated under it. This can\'t be undone.',
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
      onClick={openDetail}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); } }}
      className={`flex flex-col gap-4 p-5 rounded-lg border border-border bg-surface hover:border-border-hover transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${deleteMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <EntityIconTile icon={Icon} tone="coral" />

        {/* Stops the click from also bubbling up to the card's own openDetail — same pattern
            TaskCard.tsx uses for its own inline actions inside an otherwise-clickable card. */}
        {isAdmin ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <StatusPill
              active={definition.isActive}
              isUpdating={setActiveMutation.isPending}
              onToggle={() => setActiveMutation.mutate({ id: definition.id, isActive: !definition.isActive })}
              ariaLabel={`${definition.isActive ? 'Pause' : 'Resume'} ${definition.name}`}
            />
            <EntityCardActions
              onEdit={() => navigate(`/admin/scheduled-checklists/builder/${definition.id}`)}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
              editLabel={`Edit ${definition.name} in builder`}
              deleteLabel={`Delete ${definition.name}`}
            />
          </div>
        ) : (
          <Badge variant={definition.isActive ? 'success' : 'neutral'}>
            {definition.isActive ? 'Active' : 'Paused'}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-display text-base font-bold text-text leading-snug">{definition.name}</h3>
        <p className="text-xs font-display text-text-muted">
          {RECURRENCE_LABEL[definition.recurrence]}
          {roleLabel ? ` · ${roleLabel}` : ''}
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => {
            const TagIcon = TAG_ICON_BY_LABEL[tag];
            return (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-hover text-text-secondary text-[11px] font-display font-medium"
              >
                {TagIcon && <TagIcon size={11} />}
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {completionRate !== null ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-display font-medium">
            <span className="text-text-muted">Completion</span>
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
        </div>
      ) : (
        <p className="text-[11px] font-display text-text-light">No runs generated yet</p>
      )}

      <div className="flex items-center justify-between text-xs font-display text-text-muted pt-3 border-t border-border/60 mt-auto">
        <span>{definition.items.length} question{definition.items.length !== 1 ? 's' : ''}</span>
        <span>{definition.storeIds.length} store{definition.storeIds.length !== 1 ? 's' : ''}</span>
        <span>v{definition.version}</span>
      </div>
    </article>
  );
};
