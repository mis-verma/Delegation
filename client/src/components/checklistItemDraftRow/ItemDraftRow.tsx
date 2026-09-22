import { useState } from 'react';
import {
  Check,
  Calendar,
  User,
  Image as ImageIcon,
  Camera,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export type ChecklistItemDraft = {
  id:                 string;
  label:              string;
  assigneeId:         string;
  dueAt:              string;
  requiredImageCount: string;
  maxImageCount:      string;
  requiresLivePhoto:  boolean;
};

// Tightly coupled to ChecklistItemDraft/ChecklistItemDraftRow right below — only affects Fast
// Refresh granularity, not runtime correctness.
// eslint-disable-next-line react-refresh/only-export-components
export const emptyChecklistItemDraft = (): ChecklistItemDraft => ({
  id: crypto.randomUUID(),
  label: '', assigneeId: '', dueAt: '', requiredImageCount: '0', maxImageCount: '', requiresLivePhoto: false,
});

/** Swaps the item at `index` with its neighbor in the given direction; a no-op at either end of
 *  the array. Shared by both checklist-draft builders so reordering logic lives in one place. */
// eslint-disable-next-line react-refresh/only-export-components
export function moveDraftItem<T>(items: T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

interface AssignableUserLike {
  id:        string;
  firstName: string;
  lastName?: string | null;
}

interface ChecklistItemDraftRowProps {
  index:                   number;
  draft:                   ChecklistItemDraft;
  assignableUsers?:        AssignableUserLike[];
  canRemove:               boolean;
  onChange:                (patch: Partial<ChecklistItemDraft>) => void;
  onRemove:                () => void;
  /** Templates don't carry a due date — hide the field entirely rather than showing a dead input. */
  showDueDate?:            boolean;
  /** Set (to an explanatory placeholder) when the assignable list depends on a not-yet-chosen
   *  department — disables the select instead of showing an empty, seemingly-broken dropdown. */
  assigneeDisabledReason?: string;
  /** Reordering is opt-in — omit both to render the row without move controls at all. */
  onMoveUp?:               () => void;
  onMoveDown?:             () => void;
  canMoveUp?:              boolean;
  canMoveDown?:            boolean;
}

const FIELD_INPUT_CLASS =
  'w-full px-3 py-2 text-sm text-text-secondary bg-surface rounded-lg border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all';

// Shared by the delegation checklist builder (NewChecklistForm) and the admin checklist template
// builder (ChecklistTemplateFormUI) — both were drafting the same shape (label + assignee + photo
// requirements) through two separately-styled, separately-maintained components before this.
export const ChecklistItemDraftRow = ({
  index, draft, assignableUsers, canRemove, onChange, onRemove, showDueDate = true, assigneeDisabledReason,
  onMoveUp, onMoveDown, canMoveUp = false, canMoveDown = false,
}: ChecklistItemDraftRowProps) => {
  const assigneeDisabled = !!assigneeDisabledReason;
  // Steps start expanded so a newly-added one is immediately editable; collapsing is purely a
  // "declutter a long procedure" affordance, not a save/draft state, so it's fine to live only in
  // local state and reset if the row ever remounts.
  const [expanded, setExpanded] = useState(true);
  const canReorder = !!onMoveUp || !!onMoveDown;

  const assignee = assignableUsers?.find((u) => u.id === draft.assigneeId);
  const assigneeLabel = assignee ? `${assignee.firstName} ${assignee.lastName ?? ''}`.trim() : 'Unassigned';

  const minPhotos = Number(draft.requiredImageCount) || 0;
  const maxPhotos = draft.maxImageCount ? Number(draft.maxImageCount) : undefined;
  const photoSummary =
    minPhotos === 0 && !maxPhotos ? 'No photo required' : maxPhotos ? `${minPhotos}–${maxPhotos} photos` : `${minPhotos}+ photos`;

  return (
    // `@container` + `@sm:`/`@lg:` below size the configuration grid off this row's own rendered
    // width, not the viewport — it's dropped into modals of very different widths (a narrow
    // template-builder dialog vs. a wider one), and a viewport breakpoint would size the grid for
    // a browser window it isn't actually filling, cramming 3-4 columns into a few hundred pixels.
    <div className="@container group relative flex flex-col bg-surface rounded-xl border border-border shadow-xs transition-colors duration-200 hover:border-border-hover overflow-hidden">

      {/* Header: always visible — step number, label, an at-a-glance summary once collapsed, and
          the row's controls (reorder / collapse / remove). */}
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex shrink-0 items-center justify-center w-7 h-7 mt-0.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-bold select-none">
          {index + 1}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <label className="sr-only">Step description</label>
          <input
            value={draft.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder="e.g., Audit frontend performance metrics..."
            className="w-full bg-transparent text-text placeholder:text-text-light text-base sm:text-lg font-medium outline-none border-b border-transparent focus:border-primary-500 focus:ring-0 transition-colors pb-1"
          />

          {!expanded && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover text-text-secondary text-[11px] font-medium">
                <User size={11} /> {assigneeLabel}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover text-text-secondary text-[11px] font-medium">
                <ImageIcon size={11} /> {photoSummary}
              </span>
              {draft.requiresLivePhoto && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-500/10 text-primary-700 dark:text-primary-400 text-[11px] font-medium">
                  <Camera size={11} /> Live capture
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {canReorder && (
            <div className="flex flex-col -my-1 mr-0.5">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                className="p-0.5 text-text-light hover:text-text disabled:opacity-25 disabled:pointer-events-none rounded transition-colors cursor-pointer"
                aria-label="Move step up"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                className="p-0.5 text-text-light hover:text-text disabled:opacity-25 disabled:pointer-events-none rounded transition-colors cursor-pointer"
                aria-label="Move step down"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 text-text-light hover:text-text hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
            aria-label={expanded ? 'Collapse step details' : 'Expand step details'}
            aria-expanded={expanded}
          >
            <ChevronDown size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-text-light hover:text-danger hover:bg-danger/10 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/30 cursor-pointer"
              aria-label="Remove step"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 px-4 sm:px-5 pb-4 sm:pb-5 pl-0 @sm:pl-[3.25rem]">

          {/* Assignment — who's responsible, and by when (when relevant) */}
          <div className={`grid grid-cols-1 ${showDueDate ? '@sm:grid-cols-2' : ''} gap-4`}>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted tracking-wide">
                <User size={14} /> Assignee
              </label>
              <select
                value={draft.assigneeId}
                onChange={e => onChange({ assigneeId: e.target.value })}
                disabled={assigneeDisabled}
                className={`${FIELD_INPUT_CLASS} bg-surface-hover focus:bg-surface appearance-none disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                <option value="">{assigneeDisabledReason ?? 'Unassigned'}</option>
                {assignableUsers?.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName ?? ''}</option>
                ))}
              </select>
            </div>

            {/* Due Date — only meaningful when this draft belongs to a real delegation, not a template */}
            {showDueDate && (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted tracking-wide">
                  <Calendar size={14} /> Due Date
                </label>
                <input
                  type="date"
                  value={draft.dueAt}
                  onChange={e => onChange({ dueAt: e.target.value })}
                  className={`${FIELD_INPUT_CLASS} bg-surface-hover focus:bg-surface`}
                />
              </div>
            )}
          </div>

          {/* Photo proof — grouped as one unit since min/max counts and the live-capture toggle
              are all answering the same question (what evidence does completing this step need),
              rather than reading as three unrelated fields. */}
          <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-surface-hover/50 border border-border/60">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary tracking-wide">
                <Camera size={14} className="text-text-light" /> Photo proof
              </span>
              <span className="text-[11px] font-medium text-text-muted">
                — evidence required to mark this step complete
              </span>
            </div>

            <div className="grid grid-cols-2 @sm:grid-cols-3 gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-text-muted">Minimum</label>
                <input
                  type="number" min={0}
                  value={draft.requiredImageCount}
                  onChange={e => onChange({ requiredImageCount: e.target.value })}
                  className={FIELD_INPUT_CLASS}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-text-muted">Maximum</label>
                <input
                  type="number" min={0}
                  value={draft.maxImageCount}
                  onChange={e => onChange({ maxImageCount: e.target.value })}
                  placeholder="No limit"
                  className={`${FIELD_INPUT_CLASS} placeholder:text-text-light`}
                />
              </div>

              <label className="group/toggle col-span-2 @sm:col-span-1 flex items-center gap-2.5 cursor-pointer pb-2">
                <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                  {/* sr-only (not hidden) so keyboard users can still tab to it */}
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={draft.requiresLivePhoto}
                    onChange={e => onChange({ requiresLivePhoto: e.target.checked })}
                  />
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 ${
                    draft.requiresLivePhoto
                      ? 'bg-primary-600 border-primary-600'
                      : 'bg-surface border-border-hover group-hover/toggle:border-text-light'
                  }`}>
                    {draft.requiresLivePhoto && <Check size={14} strokeWidth={3} className="text-white" />}
                  </div>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover/toggle:text-text transition-colors leading-tight">
                  Require live camera capture
                </span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
