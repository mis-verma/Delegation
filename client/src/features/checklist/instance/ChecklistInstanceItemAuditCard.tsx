import { useState } from 'react';
import { Camera, ImageUp, X, Loader2, RotateCcw } from 'lucide-react';
import {
  useSetChecklistInstanceItemSubmissionDoneMutation,
  useUpdateChecklistInstanceItemSubmissionAccessoriesMutation,
  useUpdateChecklistInstanceItemSubmissionRemarksMutation,
  useUploadChecklistInstanceItemSubmissionImagesMutation,
  useDeleteChecklistInstanceItemSubmissionImageMutation,
  useStoresQuery,
} from '../hook';
import { ITEM_TYPE_ICON } from './checklistItemIcon';
import { ChecklistItemIconTile } from './ChecklistItemIconTile';
import type { ChecklistInstanceItem, ChecklistInstanceItemSubmission } from '../../../api/checklistInstances';
import type { CaptureMethod } from '../../../api/ticket';

const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

interface ChecklistInstanceItemAuditCardProps {
  item:           ChecklistInstanceItem;
  instanceId:     string;
  currentUserId?: string;
  isLocked:       boolean;
}

// AUDIT counterpart to ChecklistInstanceItemCard — instead of one shared isDone/photo pool, an
// AUDIT item names specific auditors (ChecklistDefinitionItem.auditUserIds) who each get their
// own ChecklistInstanceItemSubmission row, rendered here as an independent sub-card. Only the
// viewer's own submission is interactive; everyone else's (including ADMIN's view of others')
// renders read-only.
export const ChecklistInstanceItemAuditCard = ({ item, instanceId, currentUserId, isLocked }: ChecklistInstanceItemAuditCardProps) => {
  const { data: stores } = useStoresQuery();
  const storeName = (id: string | null) => (id ? stores?.find(s => s.id === id)?.name ?? '—' : '—');

  const submissions = item.submissions ?? [];
  const submittedCount = submissions.filter(s => s.isDone).length;

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <div className="flex items-start gap-3">
        <ChecklistItemIconTile icon={ITEM_TYPE_ICON[item.itemType]} done={item.isDone} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-display font-medium leading-snug ${item.isDone ? 'text-text-muted' : 'text-text'}`}>
            {item.label}
          </p>
          <p className="text-[11px] text-text-muted font-display mt-0.5">
            Audit · {submittedCount}/{submissions.length} auditor{submissions.length !== 1 ? 's' : ''} submitted
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {submissions.map(submission => (
          <SubmissionRow
            key={submission.id}
            item={item}
            submission={submission}
            instanceId={instanceId}
            storeName={storeName(submission.userId?.storeId ?? null)}
            interactive={!isLocked && !!currentUserId && submission.userId?.id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
};

interface SubmissionRowProps {
  item:        ChecklistInstanceItem;
  submission:  ChecklistInstanceItemSubmission;
  instanceId:  string;
  storeName:   string;
  interactive: boolean;
}

const SubmissionRow = ({ item, submission, instanceId, storeName, interactive }: SubmissionRowProps) => {
  const setDone = useSetChecklistInstanceItemSubmissionDoneMutation(instanceId);
  const updateAccessories = useUpdateChecklistInstanceItemSubmissionAccessoriesMutation(instanceId);
  const updateRemarks = useUpdateChecklistInstanceItemSubmissionRemarksMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceItemSubmissionImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceItemSubmissionImageMutation(instanceId);

  const [remarksDraft, setRemarksDraft] = useState(submission.remarks ?? '');
  const remarksDirty = remarksDraft !== (submission.remarks ?? '');

  const images = submission.images ?? [];
  const qualifying = item.requiresLivePhoto ? images.filter(i => i.captureMethod === 'LIVE').length : images.length;
  const photosSatisfied = item.requiredImageCount === 0 || qualifying >= item.requiredImageCount;
  const canSubmit = interactive && !submission.isDone;

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ submissionId: submission.id, files: Array.from(files), captureMethod });
  };

  const toggleAccessory = (name: string) => {
    if (!canSubmit) return;
    updateAccessories.mutate({
      id: submission.id,
      accessories: submission.accessories.map(a => (a.name === name ? { ...a, checked: !a.checked } : a)),
    });
  };

  const userLabel = `${submission.userId?.firstName ?? ''} ${submission.userId?.lastName ?? ''}`.trim() || 'Unknown user';

  // Remarks live behind their own PATCH endpoint (updateRemarks), separate from the isDone PATCH
  // (setDone) — Submit used to fire setDone directly, so a note typed into the textarea but never
  // sent via the small "Save remarks" link was silently lost the moment the item locked. Now
  // Submit itself saves any dirty remarks first and only marks done once that's settled.
  const submitting = setDone.isPending || updateRemarks.isPending;
  const handleSubmit = async () => {
    if (remarksDirty) {
      await updateRemarks.mutateAsync({ id: submission.id, remarks: remarksDraft.trim() || null });
    }
    setDone.mutate({ id: submission.id, isDone: true });
  };

  return (
    <div className="flex flex-col gap-2.5 p-2.5 rounded-lg border border-border/70 bg-background">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex items-center justify-center size-6 rounded-full shrink-0 text-[10px] font-display font-medium ${
            submission.isDone ? 'bg-success/10 text-success' : 'bg-surface-hover text-text-muted'
          }`}>
            {userLabel.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-display font-medium text-text truncate">{userLabel}</p>
            <p className="text-[10px] text-text-muted font-display truncate">{storeName}</p>
          </div>
        </div>
        {submission.isDone && interactive && (
          <button
            onClick={() => setDone.mutate({ id: submission.id, isDone: false })}
            disabled={setDone.isPending}
            className="shrink-0 p-1.5 rounded-md text-text-light hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
            aria-label="Reopen submission"
            title="Reopen"
          >
            <RotateCcw size={13} />
          </button>
        )}
        {submission.isDone && !interactive && <span className="text-[10px] font-display text-success shrink-0">Submitted</span>}
      </div>

      {/* Defensive null-check: the type says string[], but rows written before the generator job
          normalized null->[] (or any other write path that skips that step) can still hand back
          null here — a raw `.length` on that crashed the whole checklist detail page. */}
      {(item.accessories?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {submission.accessories.map(a => (
            <label
              key={a.name}
              className={[
                'flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-display transition-colors',
                a.checked ? 'border-success/40 bg-success/10 text-success' : 'border-border text-text-secondary',
                canSubmit ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-not-allowed opacity-80',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={a.checked}
                disabled={!canSubmit}
                onChange={() => toggleAccessory(a.name)}
                className="accent-primary-600 size-3"
              />
              {a.name}
            </label>
          ))}
        </div>
      )}

      {item.requiredImageCount > 0 && (
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center justify-center size-4 rounded shrink-0 ${photosSatisfied ? 'bg-success' : 'bg-warning'}`}>
            <Camera size={10} className="text-white" />
          </span>
          <span className="text-[11px] font-display text-text-muted truncate">
            {qualifying}/{item.requiredImageCount} photo{item.requiredImageCount !== 1 ? 's' : ''}
            {item.requiresLivePhoto ? ' (live only)' : ''}
          </span>
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(img => (
            <div key={img.id} className="relative">
              <img
                src={`${UPLOADS_BASE}${img.url}`}
                alt={img.originalFilename ?? 'evidence'}
                className="size-14 object-cover rounded-md border border-border"
              />
              <span className={`absolute -top-1 -left-1 text-[9px] font-display px-1 rounded-full text-white ${
                img.captureMethod === 'LIVE' ? 'bg-success' : 'bg-text-light'
              }`}>
                {img.captureMethod === 'LIVE' ? 'Live' : 'Gallery'}
              </span>
              {canSubmit && (
                <button
                  onClick={() => deleteImage.mutate(img.id)}
                  disabled={deleteImage.isPending}
                  className="absolute -top-2 -right-2 size-6 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted hover:text-danger opacity-90 hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                  aria-label="Delete image"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {submission.isDone && submission.remarks && (
        <p className="text-[11px] font-display text-text-muted italic">"{submission.remarks}"</p>
      )}

      {canSubmit && (
        <div className="flex flex-col gap-2">
          {(uploadImages.isError || setDone.isError || updateRemarks.isError) && (
            <p className="text-xs text-danger">
              {uploadImages.error instanceof Error
                ? uploadImages.error.message
                : setDone.error instanceof Error
                  ? setDone.error.message
                  : updateRemarks.error instanceof Error
                    ? updateRemarks.error.message
                    : "Couldn't save that — try again."}
            </p>
          )}

          <textarea
            value={remarksDraft}
            onChange={e => setRemarksDraft(e.target.value)}
            placeholder="Remarks (optional)…"
            rows={2}
            className="w-full px-2.5 py-2 text-xs font-display bg-surface text-text rounded-md border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-y"
          />
          {remarksDirty && (
            <button
              onClick={() => updateRemarks.mutate({ id: submission.id, remarks: remarksDraft.trim() || null })}
              disabled={updateRemarks.isPending}
              className="self-start flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors disabled:opacity-50"
            >
              {updateRemarks.isPending && <Loader2 size={11} className="animate-spin" />}
              Save remarks
            </button>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <label className="flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1">
              <Camera size={11} />
              Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={e => { handleFiles(e.target.files, 'LIVE'); e.target.value = ''; }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1">
              <ImageUp size={11} />
              Gallery
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={e => { handleFiles(e.target.files, 'GALLERY'); e.target.value = ''; }}
              />
            </label>
            {uploadImages.isPending && <Loader2 size={12} className="animate-spin text-text-muted" />}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 ml-auto"
            >
              {submitting && <Loader2 size={11} className="animate-spin" />}
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
