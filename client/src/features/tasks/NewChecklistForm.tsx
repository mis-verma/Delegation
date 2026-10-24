import { useState } from 'react';
import { Plus, CheckSquare, Library } from 'lucide-react';
import { Button, Combobox, Input, InlineError, ChecklistItemDraftRow, emptyChecklistItemDraft, moveDraftItem, type ChecklistItemDraft } from '../../components';
import {
  useAddTaskChecklistMutation,
  useAssignableUsersQuery,
  useChecklistTemplatesQuery,
  useApplyChecklistTemplateMutation,
} from './hook';

interface NewChecklistFormProps {
  taskId: string;
  onDone: () => void;
}

export const NewChecklistForm = ({ taskId, onDone }: NewChecklistFormProps) => {
  const [title, setTitle]          = useState('');
  const [itemDrafts, setItemDrafts] = useState<ChecklistItemDraft[]>([emptyChecklistItemDraft()]);
  const [templateId, setTemplateId] = useState('');

  const { data: assignableUsers } = useAssignableUsersQuery();
  const { data: templates } = useChecklistTemplatesQuery();
  const addChecklist = useAddTaskChecklistMutation(taskId);
  const applyTemplate = useApplyChecklistTemplateMutation(taskId);

  const handleApplyTemplate = () => {
    if (!templateId) return;
    applyTemplate.mutate(templateId, { onSuccess: () => setTemplateId('') });
  };

  const updateDraft = (i: number, patch: Partial<ChecklistItemDraft>) =>
    setItemDrafts(drafts => drafts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const handleRemoveDraft = (i: number) => {
    setItemDrafts(drafts => drafts.filter((_, idx) => idx !== i));
  };

  const handleAdd = () => {
    if (!title.trim()) return;
    const items = itemDrafts
      .filter(d => d.label.trim())
      .map(d => ({
        label:              d.label.trim(),
        assigneeId:         d.assigneeId || undefined,
        dueAt:              d.dueAt ? new Date(d.dueAt).toISOString() : undefined,
        requiredImageCount: Number(d.requiredImageCount) || 0,
        maxImageCount:      d.maxImageCount ? Number(d.maxImageCount) : undefined,
        requiresLivePhoto:  d.requiresLivePhoto,
      }));
    addChecklist.mutate(
      { title: title.trim(), items: items.length ? items : undefined },
      { onSuccess: onDone },
    );
  };

  const applyError = applyTemplate.error instanceof Error ? applyTemplate.error.message : "Couldn't apply that template. Try again.";
  const createError = addChecklist.error instanceof Error ? addChecklist.error.message : "Couldn't create the checklist. Check the details and try again.";

  return (
    <div className="flex flex-col gap-4 w-full p-3.5 sm:p-4 rounded-xl border border-border/60 bg-surface-hover/30">
      <div className="flex items-center gap-2.5">
        <span className="flex items-center justify-center size-8 shrink-0 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300" aria-hidden="true">
          <CheckSquare size={16} />
        </span>
        <div className="flex flex-col min-w-0">
          <h4 className="t-card font-display font-semibold text-text">New checklist</h4>
          <p className="t-meta text-text-muted">Name it, then list what has to be done.</p>
        </div>
      </div>

      {!!templates?.length && (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
            <Library size={13} className="text-text-light" aria-hidden="true" />
            Start from a template
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <Combobox
                value={templateId}
                onChange={setTemplateId}
                options={templates.map(t => ({ value: t.id, label: t.name }))}
                placeholder="Choose a template"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleApplyTemplate}
              disabled={!templateId || applyTemplate.isPending}
              isLoading={applyTemplate.isPending}
              className="font-display max-sm:h-11"
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {applyTemplate.isError && <InlineError message={applyError} />}
      {addChecklist.isError && <InlineError message={createError} />}

      <Input
        id="checklist-title"
        label="Checklist title"
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="e.g. Opening checks for the showroom"
      />

      <div className="flex flex-col gap-3">
        <h5 className="flex items-center gap-1.5 t-card font-display font-semibold text-text">
          Items
          <span className="t-meta font-semibold text-text-muted tabular-nums">{itemDrafts.length}</span>
        </h5>

        <div className="flex flex-col gap-3">
          {itemDrafts.map((draft, i) => (
            <ChecklistItemDraftRow
              key={draft.id}
              index={i}
              draft={draft}
              assignableUsers={assignableUsers}
              canRemove={itemDrafts.length > 1}
              onChange={patch => updateDraft(i, patch)}
              onRemove={() => handleRemoveDraft(i)}
              onMoveUp={() => setItemDrafts(d => moveDraftItem(d, i, 'up'))}
              onMoveDown={() => setItemDrafts(d => moveDraftItem(d, i, 'down'))}
              canMoveUp={i > 0}
              canMoveDown={i < itemDrafts.length - 1}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setItemDrafts(d => [...d, emptyChecklistItemDraft()])}
          className="flex items-center justify-center gap-2 w-full min-h-11 rounded-xl border border-border/60 bg-surface t-card font-display font-semibold text-text-secondary hover:border-primary-500/50 hover:text-text transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]"
        >
          <span className="flex items-center justify-center size-5 rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-300" aria-hidden="true">
            <Plus size={12} strokeWidth={2.75} />
          </span>
          Add another item
        </button>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-3 border-t border-border/60">
        <Button variant="outline" onClick={onDone} className="font-display max-sm:h-11">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={!title.trim() || addChecklist.isPending}
          isLoading={addChecklist.isPending}
          className="font-display max-sm:h-11"
        >
          Create checklist
        </Button>
      </div>
    </div>
  );
};
