import { useMemo, useState } from 'react';
import { Camera, ImageUp, X, Loader2, RotateCcw, Check } from 'lucide-react';
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
  /** Same rule as every other item type — whoever's assigned this checklist (or ADMIN/PC) can
   *  fill it in. One field auditor works through everyone on this list themselves; a row here
   *  isn't locked to whichever account happens to share that row's name. */
  canWork:        boolean;
  currentUserId?: string;
  isLocked:       boolean;
}

const submissionLabel = (submission: ChecklistInstanceItemSubmission) =>
  `${submission.userId?.firstName ?? ''} ${submission.userId?.lastName ?? ''}`.trim() || 'Unknown user';

// Picking a person first, then filling in just their form, keeps this readable whether the audit
// covers 3 people or 30 — the old layout rendered every one of their checklists stacked on top of
// each other at once, which turned into a wall of checkboxes long before the list got long.
export const ChecklistInstanceItemAuditCard = ({ item, instanceId, canWork, currentUserId, isLocked }: ChecklistInstanceItemAuditCardProps) => {
  const { data: stores } = useStoresQuery();
  const storeName = (id: string | null) => (id ? stores?.find(s => s.id === id)?.name ?? '—' : '—');

  const submissions = useMemo(() => item.submissions ?? [], [item.submissions]);
  const submittedCount = submissions.filter(s => s.isDone).length;
  const auditProgress = submissions.length ? Math.round((submittedCount / submissions.length) * 100) : 0;

  const defaultSelectedId = useMemo(() => {
    const own = submissions.find(s => s.userId?.id === currentUserId && !s.isDone);
    if (own) return own.id;
    const pending = submissions.find(s => !s.isDone);
    return (pending ?? submissions[0])?.id ?? null;
  }, [submissions, currentUserId]);

  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);
  const selected = submissions.find(s => s.id === selectedId) ?? submissions[0] ?? null;

  return (
    <div className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <div className="flex items-start gap-3">
        <ChecklistItemIconTile icon={ITEM_TYPE_ICON[item.itemType]} done={item.isDone} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-display font-medium leading-snug ${item.isDone ? 'text-text-muted' : 'text-text'}`}>
            {item.label}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="h-1.5 flex-1 max-w-32 bg-surface-hover rounded-full overflow-hidden border border-border/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ${item.isDone ? 'bg-success' : auditProgress > 0 ? 'bg-warning' : 'bg-border'}`}
                style={{ width: `${auditProgress}%` }}
              />
            </div>
            <span className="text-[11px] text-text-muted font-display shrink-0">
              {submittedCount}/{submissions.length} checked
            </span>
          </div>
        </div>
      </div>

      {submissions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-display font-medium text-text-muted mb-1.5">Select a person</p>
            <div className="flex flex-wrap gap-1.5">
              {submissions.map(submission => {
                const label = submissionLabel(submission);
                const isActive = submission.id === selected?.id;
                const isMe = !!currentUserId && submission.userId?.id === currentUserId;
                return (
                  <button
                    key={submission.id}
                    type="button"
                    onClick={() => setSelectedId(submission.id)}
                    className={[
                      'flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs font-display font-medium transition-all duration-150 cursor-pointer active:scale-95',
                      isActive
                        ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300 shadow-sm'
                        : submission.isDone
                          ? 'border-success/30 bg-success/5 text-text-secondary hover:bg-success/10'
                          : 'border-border text-text-secondary hover:bg-surface-hover',
                    ].join(' ')}
                  >
                    <span className="relative flex items-center justify-center size-5 rounded-full text-[9px] font-display font-semibold shrink-0 bg-surface-hover text-text-muted">
                      {label.slice(0, 1).toUpperCase()}
                      {submission.isDone && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-2.5 rounded-full bg-success text-white ring-2 ring-surface">
                          <Check size={7} strokeWidth={3.5} />
                        </span>
                      )}
                    </span>
                    <span className="truncate max-w-28">{label}{isMe ? ' (You)' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <SubmissionDetail
              key={selected.id}
              item={item}
              submission={selected}
              instanceId={instanceId}
              storeName={storeName(selected.userId?.storeId ?? null)}
              interactive={!isLocked && canWork}
            />
          )}
        </div>
      )}
    </div>
  );
};

interface SubmissionDetailProps {
  item:        ChecklistInstanceItem;
  submission:  ChecklistInstanceItemSubmission;
  instanceId:  string;
  storeName:   string;
  interactive: boolean;
}

const SubmissionDetail = ({ item, submission, instanceId, storeName, interactive }: SubmissionDetailProps) => {
  const setDone = useSetChecklistInstanceItemSubmissionDoneMutation(instanceId);
  const updateAccessories = useUpdateChecklistInstanceItemSubmissionAccessoriesMutation(instanceId);
  const updateRemarks = useUpdateChecklistInstanceItemSubmissionRemarksMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceItemSubmissionImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceItemSubmissionImageMutation(instanceId);

  const [remarksDraft, setRemarksDraft] = useState(submission.remarks ?? '');
  const remarksDirty = remarksDraft !== (submission.remarks ?? '');
  // Ticked instantly, on the tap — not after the round trip. The mutation still fires and saves
  // for real, but nobody should have to stare at a checkbox for half a second wondering if their
  // tap registered. Rolled back to the last known-good state only if the save actually fails.
  const [accessoriesDraft, setAccessoriesDraft] = useState(submission.accessories);

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
    const next = accessoriesDraft.map(a => (a.name === name ? { ...a, checked: !a.checked } : a));
    setAccessoriesDraft(next);
    updateAccessories.mutate({ id: submission.id, accessories: next }, {
      onError: () => setAccessoriesDraft(submission.accessories),
    });
  };

  const userLabel = submissionLabel(submission);

  const submitting = setDone.isPending || updateRemarks.isPending;
  const handleSubmit = async () => {
    if (remarksDirty) {
      await updateRemarks.mutateAsync({ id: submission.id, remarks: remarksDraft.trim() || null });
    }
    setDone.mutate({ id: submission.id, isDone: true });
  };

  return (
    <div className={`flex flex-col gap-3 p-3 rounded-xl border transition-colors duration-200 animate-in fade-in slide-in-from-bottom-1 duration-200 ${
      submission.isDone ? 'border-success/25 bg-success/[0.03]' : 'border-border bg-background'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative shrink-0">
            <span className={`flex items-center justify-center size-8 rounded-full text-xs font-display font-semibold ${
              submission.isDone ? 'bg-success/15 text-success' : 'bg-surface-hover text-text-muted'
            }`}>
              {userLabel.slice(0, 1).toUpperCase()}
            </span>
            {submission.isDone && (
              <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-3.5 rounded-full bg-success text-white ring-2 ring-surface">
                <Check size={9} strokeWidth={3.5} />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-display font-medium text-text truncate">{userLabel}</p>
            <p className="text-[11px] text-text-muted font-display truncate">{storeName}</p>
          </div>
        </div>
        {submission.isDone && interactive && (
          <button
            onClick={() => setDone.mutate({ id: submission.id, isDone: false })}
            disabled={setDone.isPending}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-display font-medium text-text-light hover:text-warning hover:bg-warning/10 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
          >
            <RotateCcw size={13} />
            Reopen
          </button>
        )}
        {submission.isDone && !interactive && (
          <span className="shrink-0 text-[11px] font-display font-medium text-success bg-success/10 px-2 py-1 rounded-md">Submitted</span>
        )}
        {!submission.isDone && !interactive && (
          <span className="shrink-0 text-[11px] font-display font-medium text-text-light bg-surface-hover px-2 py-1 rounded-md">Pending</span>
        )}
      </div>

      {(item.accessories?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-display font-medium text-text-muted mb-1.5">What they have</p>
          <div className="flex flex-wrap gap-1.5">
            {accessoriesDraft.map(a => (
              <button
                key={a.name}
                type="button"
                aria-pressed={a.checked}
                disabled={!canSubmit}
                onClick={() => toggleAccessory(a.name)}
                className={[
                  'flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-lg border text-xs font-display font-medium transition-all duration-150 active:scale-95',
                  a.checked ? 'border-success/40 bg-success/10 text-success' : 'border-border text-text-secondary',
                  canSubmit ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-not-allowed opacity-80',
                ].join(' ')}
              >
                <span className={`flex items-center justify-center size-4 rounded-[4px] border shrink-0 transition-colors duration-150 ${
                  a.checked ? 'bg-success border-success text-white' : 'border-border-hover text-transparent'
                }`}>
                  <Check size={10} strokeWidth={3} />
                </span>
                {a.name}
              </button>
            ))}
          </div>
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

      {!canSubmit && submission.remarks && (
        <div>
          <p className="text-[11px] font-display font-medium text-text-muted mb-1">Remarks</p>
          <p className="text-xs font-display text-text-secondary italic">"{submission.remarks}"</p>
        </div>
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

          <div>
            <p className="text-[11px] font-display font-medium text-text-muted mb-1">Remarks</p>
            <textarea
              value={remarksDraft}
              onChange={e => setRemarksDraft(e.target.value)}
              placeholder="Were they present today? Note anything missing or out of place…"
              rows={2}
              className="w-full px-2.5 py-2 text-xs font-display bg-surface text-text rounded-md border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-y"
            />
          </div>
          {remarksDirty && (
            <button
              onClick={() => updateRemarks.mutate({ id: submission.id, remarks: remarksDraft.trim() || null })}
              disabled={updateRemarks.isPending}
              className="self-start flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
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
              className="flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:active:scale-100 ml-auto"
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
