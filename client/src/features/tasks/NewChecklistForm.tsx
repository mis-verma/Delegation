import { useState } from 'react';
import { Plus, CheckSquare, Library, AlertCircle } from 'lucide-react';
import { Button, Combobox, Input, ChecklistItemDraftRow, emptyChecklistItemDraft, moveDraftItem, type ChecklistItemDraft } from '../../components';
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

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-8 border border-border rounded-2xl bg-surface w-full max-w-4xl mx-auto">

      <div className="flex items-center gap-3 pb-4 border-b border-border/60">
        <div className="flex items-center justify-center w-10 h-10 bg-primary-50 text-primary-600 rounded-lg shrink-0">
          <CheckSquare size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-text tracking-tight">Create Checklist</h2>
          <p className="text-sm text-text-secondary mt-0.5">Define tasks, assignees, and requirements</p>
        </div>
      </div>

      {!!templates?.length && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-surface-hover/40 rounded-xl border border-border/60">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Library size={16} className="text-text-muted" />
            Start from a template
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Combobox
                value={templateId}
                onChange={setTemplateId}
                options={templates.map(t => ({ value: t.id, label: t.name }))}
                placeholder="Select a template..."
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleApplyTemplate}
              disabled={!templateId || applyTemplate.isPending}
              isLoading={applyTemplate.isPending}
              className="whitespace-nowrap"
            >
              {applyTemplate.isPending ? 'Applying...' : 'Apply'}
            </Button>
          </div>
        </div>
      )}

      {applyTemplate.isError && (
        <div className="flex items-start gap-3 p-4 bg-danger/10 text-danger rounded-xl border border-danger/20">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="text-sm font-medium">
            {applyTemplate.error instanceof Error ? applyTemplate.error.message : 'Failed to apply template. Please try again.'}
          </div>
        </div>
      )}

      {addChecklist.isError && (
        <div className="flex items-start gap-3 p-4 bg-danger/10 text-danger rounded-xl border border-danger/20">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="text-sm font-medium">
            {addChecklist.error instanceof Error ? addChecklist.error.message : 'Failed to create checklist. Please verify your inputs.'}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="w-full">
          <Input
            id="checklist-title"
            label="Checklist Title"
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Q3 Security Audit Pre-flight"
            className="text-lg font-medium"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text">
              Tasks <span className="text-text-muted font-medium ml-1">({itemDrafts.length})</span>
            </h3>
          </div>

          <div className="flex flex-col gap-4">
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
            className="group flex items-center justify-center gap-2 py-4 mt-2 text-sm font-medium text-primary-600 bg-primary-500/5 hover:bg-primary-500/10 border-2 border-primary-200 hover:border-primary-300 rounded-xl transition-all w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 group-hover:scale-110 transition-transform">
              <Plus size={14} strokeWidth={2.5} />
            </div>
            Add Another Task
          </button>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-6 mt-4 border-t border-border/60">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={!title.trim() || addChecklist.isPending}
          isLoading={addChecklist.isPending}
        >
          {addChecklist.isPending ? 'Creating...' : 'Create Checklist'}
        </Button>
      </div>
    </div>
  );
};