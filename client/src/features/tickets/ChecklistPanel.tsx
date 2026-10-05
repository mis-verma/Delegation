import { useState } from 'react';
import {
  Plus, Trash2, Loader2, CheckSquare, ChevronDown, ChevronRight,
  Camera, Image as ImageIcon, X, RotateCcw, ListChecks, AlertCircle, Library,
} from 'lucide-react';
import {
  Button, EmptyState,
  ChecklistItemDraftRow, emptyChecklistItemDraft, moveDraftItem, type ChecklistItemDraft,
} from '../../components';
import { SECTION_HEADER } from './detail/detailConstants';
import {
  useAddChecklistMutation,
  useDeleteChecklistMutation,
  useUpdateChecklistItemMutation,
  useUpdateChecklistItemRemarksMutation,
  useCompleteChecklistItemMutation,
  useDeleteChecklistItemMutation,
  useUploadChecklistImagesMutation,
  useDeleteChecklistImageMutation,
  useAssignableUsersQuery,
  useChecklistTemplatesQuery,
  useApplyChecklistTemplateMutation,
} from './hook';
import { errorMessage } from '../../lib/queryHelpers';
import { UPLOADS_BASE } from '../../lib/uploadsBase';
import type { Checklist, ChecklistItem, CaptureMethod } from '../../api/ticket';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/ui/badge';

interface ChecklistPanelProps {
  ticketId: string;
  checklists: Checklist[];
}

// Same card language as the Delegation side's own (currently dormant) ChecklistItemRow — bigger
// icon square, badge-style metadata chips, a hero image strip with a hover overlay, and full-size
// buttons instead of tiny text links. This used to be its own smaller, denser version of the same
// idea; bringing it in line means a ticket's checklist and a delegation's checklist finally read as
// the same feature instead of two different-looking ones.
const ItemRow = ({
  item, ticketId, isAdmin, canWork,
}: {
  item: ChecklistItem;
  ticketId: string;
  isAdmin: boolean;
  canWork: boolean;
}) => {
  const [remarks, setRemarks] = useState(item.remarks ?? '');
  const updateItem = useUpdateChecklistItemMutation(ticketId);
  const updateRemarks = useUpdateChecklistItemRemarksMutation(ticketId);
  const completeItem = useCompleteChecklistItemMutation(ticketId);
  const deleteItem = useDeleteChecklistItemMutation(ticketId);
  const uploadImages = useUploadChecklistImagesMutation(ticketId);
  const deleteImage = useDeleteChecklistImageMutation(ticketId);

  const images = item.images ?? [];
  const qualifying = item.requiresLivePhoto
    ? images.filter(i => i.captureMethod === 'LIVE').length
    : images.length;

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod });
  };

  const photosSatisfied = item.requiredImageCount > 0 && qualifying >= item.requiredImageCount;

  return (
    <div
      className={`group/card flex flex-col gap-3 sm:gap-4 p-3.5 sm:p-5 rounded-xl border transition-all duration-200 min-w-0 ${
        item.isDone
          ? 'bg-surface-hover/40 border-border/60 opacity-80'
          : 'bg-surface border-border hover:border-border-hover'
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        <span
          className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-md shrink-0 transition-all ${
            item.isDone
              ? 'bg-primary-500 text-white'
              : 'bg-surface text-text-light border-[1.5px] border-border-hover'
          }`}
        >
          {item.isDone && <CheckSquare size={14} strokeWidth={3} />}
        </span>

        <div className="flex-1 min-w-0">
          <p className={`text-[15px] font-medium leading-snug break-words ${item.isDone ? 'line-through text-text-light' : 'text-text'}`}>
            {item.label}
          </p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="neutral" className="text-xs bg-surface-hover">
              {item.isDone && item.completedAt
                ? `Completed ${new Date(item.completedAt).toLocaleDateString()}`
                : item.dueAt
                  ? `Due ${new Date(item.dueAt).toLocaleDateString()}`
                  : 'No due date'}
            </Badge>

            {item.requiredImageCount > 0 && (
              <Badge
                variant={photosSatisfied ? 'default' : 'warning'}
                className={`text-xs ${photosSatisfied ? 'bg-primary-50 dark:bg-primary-500/10' : 'bg-warning/10'}`}
              >
                <Camera size={12} strokeWidth={2.5} />
                {qualifying}/{item.requiredImageCount} {item.requiresLivePhoto ? 'Live' : 'Photos'}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 transition-opacity focus-within:opacity-100">
          {isAdmin && item.isDone && (
            <button
              type="button"
              onClick={() => updateItem.mutate({ id: item.id, payload: { isDone: false } })}
              disabled={updateItem.isPending}
              className="flex items-center justify-center size-11 sm:size-8 text-text-light hover:text-warning hover:bg-warning/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
              title="Reopen item"
              aria-label="Reopen item"
            >
              <RotateCcw size={16} />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => deleteItem.mutate(item.id)}
              disabled={deleteItem.isPending}
              className="flex items-center justify-center size-11 sm:size-8 text-text-light hover:text-danger hover:bg-danger/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
              title="Delete item"
              aria-label="Delete item"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 pl-0 sm:pl-9 max-w-xl">
          {images.map(img => (
            <div key={img.id} className="relative group/img aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface-hover">
              <img
                src={`${UPLOADS_BASE}${img.url}`}
                alt={img.originalFilename ?? 'evidence'}
                className="size-full object-cover transition-transform duration-300 group-hover/img:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 pointer-coarse:opacity-100 transition-opacity pointer-events-none" />

              <span className={`absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                img.captureMethod === 'LIVE' ? 'bg-primary-600' : 'bg-black/85'
              }`}>
                {img.captureMethod === 'LIVE' ? 'Live' : 'Gallery'}
              </span>

              {canWork && (
                <button
                  type="button"
                  onClick={() => deleteImage.mutate(img.id)}
                  disabled={deleteImage.isPending}
                  aria-label="Remove image"
                  className="absolute top-1 right-1 flex items-center justify-center size-8 rounded-full bg-danger/90 text-white opacity-0 group-hover/img:opacity-100 pointer-coarse:opacity-100 transition-all hover:bg-danger hover:scale-105 cursor-pointer outline-none focus:opacity-100 after:absolute after:-inset-1.5 focus-visible:ring-2 focus-visible:ring-danger/50 disabled:opacity-50"
                >
                  {deleteImage.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={14} strokeWidth={2.5} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pl-0 sm:pl-9 flex flex-col gap-4">
        {(!canWork || item.isDone) && item.remarks && (
          <div className="px-4 py-3 bg-surface-hover/50 rounded-lg border border-border/60 text-sm text-text-secondary italic break-words">
            "{item.remarks}"
          </div>
        )}

        {canWork && !item.isDone && (
          <div className="flex flex-col gap-3">
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Add remarks or notes…"
              rows={2}
              className="w-full px-3 py-2.5 text-base sm:text-sm text-text bg-surface rounded-lg border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 placeholder:text-text-light resize-none transition-all outline-none"
            />

            {(uploadImages.isError || completeItem.isError) && (
              <div className="flex items-start gap-2 px-3 py-2 bg-danger/10 rounded-lg border border-danger/20">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-xs text-danger font-medium break-words min-w-0">
                  {uploadImages.isError
                    ? errorMessage(uploadImages.error, 'An error occurred while saving.')
                    : errorMessage(completeItem.error, 'An error occurred while saving.')}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2 flex-wrap">
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <label className="flex items-center justify-center gap-2 text-sm font-medium px-4 min-h-11 sm:min-h-9 rounded-lg border border-info/30 text-info bg-info/10 hover:bg-info/20 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-info/30">
                  <Camera size={16} />
                  Take Photo
                  <input
                    type="file" accept="image/*" capture="environment" multiple
                    className="sr-only" onChange={e => { handleFiles(e.target.files, 'LIVE'); e.target.value = ''; }}
                  />
                </label>

                <label className="flex items-center justify-center gap-2 text-sm font-medium px-4 min-h-11 sm:min-h-9 rounded-lg border border-border text-text-secondary bg-surface hover:bg-surface-hover cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-border-hover">
                  <ImageIcon size={16} />
                  Gallery
                  <input
                    type="file" accept="image/*" multiple
                    className="sr-only" onChange={e => { handleFiles(e.target.files, 'GALLERY'); e.target.value = ''; }}
                  />
                </label>

                {uploadImages.isPending && <Loader2 size={18} className="animate-spin text-info" aria-label="Uploading" />}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => updateRemarks.mutate({ id: item.id, remarks })}
                  disabled={updateRemarks.isPending || !remarks.trim()}
                  className="flex items-center justify-center gap-1.5 text-sm font-medium px-4 min-h-11 sm:min-h-9 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  {updateRemarks.isPending && <Loader2 size={16} className="animate-spin" />}
                  Save Notes
                </button>

                <button
                  type="button"
                  onClick={() => completeItem.mutate(item.id)}
                  disabled={completeItem.isPending}
                  className="flex items-center justify-center gap-2 text-sm font-medium px-5 min-h-11 sm:min-h-9 rounded-lg bg-primary-600 text-white hover:bg-primary-700 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-95"
                >
                  {completeItem.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                  Complete Item
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Same rounded-xl card, animated progress bar, and smooth collapse as the Delegation side's own
// ChecklistBlock — a flat "3/5" counter next to a plain title used to be the only progress signal.
const ChecklistBlock = ({
  checklist, ticketId, isAdmin, currentUserId,
}: {
  checklist: Checklist;
  ticketId: string;
  isAdmin: boolean;
  currentUserId?: string;
}) => {
  const [open, setOpen] = useState(true);
  const deleteChecklist = useDeleteChecklistMutation(ticketId);
  const doneCount = checklist.items.filter(i => i.isDone).length;
  const progress = checklist.items.length ? (doneCount / checklist.items.length) * 100 : 0;
  const isComplete = progress === 100;

  const toggle = () => setOpen(v => !v);
  const onToggleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className={`rounded-xl border transition-colors duration-200 overflow-hidden ${
      isComplete ? 'bg-surface-hover/40 border-border/60' : 'bg-surface border-border'
    }`}>
      <div
        className={`group flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 sm:py-4 cursor-pointer transition-colors hover:bg-surface-hover/60 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-inset ${open ? 'border-b border-border/60' : ''}`}
        onClick={toggle}
        onKeyDown={onToggleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 sm:gap-3.5 flex-1 min-w-0">
          <div className="p-1 rounded-md bg-surface border border-border text-text-muted group-hover:text-text-secondary group-hover:border-border-hover transition-colors shrink-0">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`text-[15px] font-medium leading-snug line-clamp-2 break-words transition-colors ${isComplete ? 'text-text-muted' : 'text-text'}`}>
              {checklist.title}
            </h4>
            <div className="flex items-center gap-3 mt-1.5 max-w-xs">
              <div className="h-2 flex-1 bg-surface-hover rounded-full overflow-hidden border border-border/50">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${isComplete ? 'bg-primary-500' : 'bg-info'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums min-w-8 shrink-0 ${isComplete ? 'text-primary-600' : 'text-text-muted'}`}>
                {doneCount}/{checklist.items.length}
              </span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); deleteChecklist.mutate(checklist.id); }}
            disabled={deleteChecklist.isPending}
            className="flex items-center justify-center size-11 sm:size-9 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
            title="Delete checklist"
            aria-label="Delete checklist"
          >
            {deleteChecklist.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          </button>
        )}
      </div>

      <div className={`transition-all duration-300 ease-in-out ${open ? 'opacity-100 max-h-[5000px]' : 'opacity-0 max-h-0 overflow-hidden'}`}>
        <div className="flex flex-col gap-3 sm:gap-4 p-2.5 sm:p-4 bg-surface-hover/30">
          {checklist.items.length === 0 && (
            <div className="p-6 sm:p-8 text-center text-sm font-medium text-text-muted bg-surface rounded-xl border-2 border-dashed border-border">
              No items in this checklist yet.
            </div>
          )}
          {checklist.items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              ticketId={ticketId}
              isAdmin={isAdmin}
              canWork={isAdmin || (!!currentUserId && item.assigneeId === currentUserId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export const ChecklistPanel = ({ ticketId, checklists }: ChecklistPanelProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PC';
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  // Same draft shape/component the Delegation checklist builder and the admin template builder
  // already share (components/checklistItemDraftRow) — was its own hand-rolled raw input grid
  // here, a third, differently-styled copy of the exact same "label + assignee + photo proof" row.
  const [itemDrafts, setItemDrafts] = useState<ChecklistItemDraft[]>([emptyChecklistItemDraft()]);

  const { data: assignableUsers } = useAssignableUsersQuery();
  const { data: templates } = useChecklistTemplatesQuery();
  const addChecklist = useAddChecklistMutation(ticketId);
  const applyTemplate = useApplyChecklistTemplateMutation(ticketId);
  const [templateId, setTemplateId] = useState('');

  const handleApplyTemplate = () => {
    if (!templateId) return;
    applyTemplate.mutate(templateId, { onSuccess: () => setTemplateId('') });
  };

  const updateDraft = (i: number, patch: Partial<ChecklistItemDraft>) =>
    setItemDrafts(drafts => drafts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const handleRemoveDraft = (i: number) =>
    setItemDrafts(drafts => drafts.filter((_, idx) => idx !== i));

  const resetForm = () => {
    setTitle('');
    setItemDrafts([emptyChecklistItemDraft()]);
    setAdding(false);
  };

  const handleAdd = () => {
    if (!title.trim()) return;
    const items = itemDrafts
      .filter(d => d.label.trim())
      .map(d => ({
        label: d.label.trim(),
        assigneeId: d.assigneeId || undefined,
        dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : undefined,
        requiredImageCount: Number(d.requiredImageCount) || 0,
        maxImageCount: d.maxImageCount ? Number(d.maxImageCount) : undefined,
        requiresLivePhoto: d.requiresLivePhoto,
      }));
    addChecklist.mutate(
      { title: title.trim(), items: items.length ? items : undefined },
      { onSuccess: resetForm },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className={SECTION_HEADER}>
          Checklists
        </h3>
        {isAdmin && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 min-h-11 sm:min-h-8 text-xs font-display font-bold text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors cursor-pointer px-3 rounded-lg hover:bg-primary-500/10 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Add checklist
          </button>
        )}
      </div>

      {/* The create-checklist card — same header/template/footer language as the Delegation
          side's NewChecklistForm, minus its centered max-w-4xl sizing (that was built for a wide
          modal; this sits inside a narrower detail panel, so it stays full-width instead). */}
      {adding && (
        <div className="flex flex-col gap-4 sm:gap-5 p-3.5 sm:p-5 border border-border rounded-2xl bg-surface min-w-0">
          <div className="flex items-center gap-3 pb-4 border-b border-border/60">
            <div className="flex items-center justify-center w-9 h-9 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-lg shrink-0">
              <ListChecks size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="text-base font-display font-bold text-text tracking-tight">New checklist</h4>
              <p className="text-xs text-text-secondary mt-0.5">Define steps, assignees, and photo proof requirements.</p>
            </div>
          </div>

          {!!templates?.length && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-surface-hover/40 rounded-xl border border-border/60">
              <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <Library size={16} className="text-text-muted" />
                Start from a template
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Apply a checklist template"
                  value={templateId}
                  onChange={e => setTemplateId(e.target.value)}
                  className="flex-1 min-w-0 sm:w-56 sm:flex-none px-3 min-h-11 sm:min-h-9 text-base sm:text-sm text-text-secondary bg-surface rounded-lg border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select a template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApplyTemplate}
                  disabled={!templateId}
                  isLoading={applyTemplate.isPending}
                  className="whitespace-nowrap shrink-0"
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {applyTemplate.isError && (
            <div className="flex items-start gap-2.5 p-3 bg-danger/10 text-danger rounded-xl border border-danger/20">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p className="text-sm font-medium">
                {errorMessage(applyTemplate.error, 'Failed to apply template. Please try again.')}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-checklist-title" className="text-xs font-display font-bold text-text-secondary">
              Checklist title
            </label>
            <input
              id="ticket-checklist-title"
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Pre-dispatch quality check"
              className="w-full px-3.5 py-2.5 min-h-11 text-base font-medium text-text bg-surface rounded-lg border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 placeholder:text-text-light outline-none transition-all"
            />
          </div>

          <div className="flex flex-col gap-3">
            <h5 className="text-xs font-display font-bold text-text-secondary">
              Steps <span className="text-text-muted font-medium">({itemDrafts.length})</span>
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
              className="group flex items-center justify-center gap-2 min-h-12 py-3 text-sm font-medium text-primary-600 bg-primary-500/5 hover:bg-primary-500/10 border-2 border-primary-200 dark:border-primary-500/30 hover:border-primary-300 rounded-xl border-dashed transition-all w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform">
                <Plus size={12} strokeWidth={2.5} />
              </span>
              Add another step
            </button>
          </div>

          {addChecklist.isError && (
            <div className="flex items-start gap-2.5 p-3 bg-danger/10 text-danger rounded-xl border border-danger/20">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p className="text-sm font-medium">
                {errorMessage(addChecklist.error, 'Failed to create checklist. Please verify your inputs.')}
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-4 border-t border-border/60">
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAdd}
              disabled={!title.trim()}
              isLoading={addChecklist.isPending}
            >
              Create checklist
            </Button>
          </div>
        </div>
      )}

      {checklists.length === 0 && !adding && (
        <EmptyState
          icon={ListChecks}
          title="No checklists yet"
          description={isAdmin ? 'Add a checklist to track sub-tasks and required evidence.' : 'Nothing to check off on this ticket yet.'}
          size="compact"
        />
      )}

      {checklists.map(cl => (
        <ChecklistBlock
          key={cl.id}
          checklist={cl}
          ticketId={ticketId}
          isAdmin={isAdmin}
          currentUserId={user?.id}
        />
      ))}
    </div>
  );
};
