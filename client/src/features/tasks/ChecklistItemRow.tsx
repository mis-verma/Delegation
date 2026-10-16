import { useState } from 'react';
import {
  Trash2, Loader2, CheckSquare, Camera, X, RotateCcw, Image as ImageIcon, AlertCircle, MessageSquarePlus
} from 'lucide-react';
import {
  useUpdateTaskChecklistItemMutation,
  useUpdateTaskItemRemarksMutation,
  useCompleteTaskChecklistItemMutation,
  useDeleteTaskChecklistItemMutation,
  useUploadTaskImagesMutation,
  useDeleteTaskImageMutation,
} from './hook';
import type { TaskChecklistItem, CaptureMethod } from '../../api/taskChecklist';
import { UPLOADS_BASE } from '../../lib/uploadsBase';
import { errorMessage } from '../../lib/queryHelpers';
import { Badge } from '../../components/ui/badge';

export const ChecklistItemRow = ({
  item, taskId, isAdmin, canWork,
}: {
  item:     TaskChecklistItem;
  taskId:   string;
  isAdmin:  boolean;
  canWork:  boolean;
}) => {
  const [remarks, setRemarks] = useState(item.remarks ?? '');
  // The remark box and photo buttons stay folded until asked for (or already in use), so a list of items is a
  // list, not a wall of forms.
  const [expanded, setExpanded] = useState(() => !!item.remarks || (item.images?.length ?? 0) > 0 || item.requiredImageCount > 0);

  const updateItem    = useUpdateTaskChecklistItemMutation(taskId);
  const updateRemarks = useUpdateTaskItemRemarksMutation(taskId);
  const completeItem  = useCompleteTaskChecklistItemMutation(taskId);
  const deleteItem    = useDeleteTaskChecklistItemMutation(taskId);
  const uploadImages  = useUploadTaskImagesMutation(taskId);
  const deleteImage   = useDeleteTaskImageMutation(taskId);

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
      className={`group/card flex flex-col gap-3 p-3.5 sm:p-4 rounded-xl border transition-all duration-200 ${
        item.isDone
          ? 'bg-surface-hover/40 border-border/60 opacity-80'
          : 'bg-surface border-border hover:border-border-hover'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3 sm:gap-3.5">
        <span
          className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-md shrink-0 transition-all ${
            item.isDone
              ? 'bg-success text-white'
              : 'bg-surface text-text-light border-[1.5px] border-border-hover'
          }`}
        >
          {item.isDone && <CheckSquare size={14} strokeWidth={3} />}
        </span>

        <div className="flex-1 min-w-0">
          <p className={`t-card font-medium leading-snug ${
            item.isDone ? 'line-through text-text-light' : 'text-text'
          }`}>
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
                className={`text-xs ${photosSatisfied ? 'bg-success/10 text-success' : 'bg-warning/10'}`}
              >
                <Camera size={12} strokeWidth={2.5} />
                {qualifying}/{item.requiredImageCount} {item.requiresLivePhoto ? 'Live' : 'Photos'}
              </Badge>
            )}
          </div>
        </div>

        {/* Admin actions — always visible on touch (no hover), reveal-on-hover on pointer devices */}
        <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity focus-within:opacity-100">
          {isAdmin && item.isDone && (
            <button
              type="button"
              onClick={() => updateItem.mutate({ id: item.id, payload: { isDone: false } })}
              disabled={updateItem.isPending}
              className="flex items-center justify-center size-8 pointer-coarse:size-11 text-text-light hover:text-warning hover:bg-warning/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
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
              className="flex items-center justify-center size-8 pointer-coarse:size-11 text-text-light hover:text-danger hover:bg-danger/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
              title="Delete item"
              aria-label="Delete item"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Hero image strip */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3 pl-0 sm:pl-9">
          {images.map(img => (
            <div key={img.id} className="relative group/img overflow-hidden rounded-lg border border-border bg-surface-hover">
              <img
                src={`${UPLOADS_BASE}${img.url}`}
                alt={img.originalFilename ?? 'evidence'}
                className="w-20 h-20 object-cover"
              />

              <span className={`absolute top-1 left-1 text-xs font-bold px-1.5 py-0.5 rounded text-white ${
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
                  className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-danger/90 text-white opacity-0 group-hover/img:opacity-100 pointer-coarse:opacity-100 after:absolute after:-inset-2.5 transition-opacity hover:bg-danger cursor-pointer outline-none focus:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/50 disabled:opacity-50"
                >
                  {deleteImage.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={14} strokeWidth={2.5} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Body & Actions */}
      <div className="pl-0 sm:pl-9 flex flex-col gap-3">
        {(!canWork || item.isDone) && item.remarks && (
          <div className="px-4 py-3 bg-surface-hover/50 rounded-lg border border-border/60 text-sm text-text-secondary italic">
            "{item.remarks}"
          </div>
        )}

        {canWork && !item.isDone && (
          <div className="flex flex-col gap-3">
            {expanded && (<>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Add a remark, e.g. why this can't be done yet"
              rows={2}
              className="w-full px-3 py-2 text-base sm:text-sm text-text bg-surface rounded-lg border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 placeholder:text-text-light resize-none transition-all outline-none"
            />

            {(uploadImages.isError || completeItem.isError) && (
              <div className="flex items-start gap-2 px-3 py-2 bg-danger/10 rounded-lg border border-danger/20">
                 <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
                 <p className="text-xs text-danger font-medium">
                  {uploadImages.isError
                    ? errorMessage(uploadImages.error, "Couldn't save that. Try again.")
                    : errorMessage(completeItem.error, "Couldn't save that. Try again.")}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm font-medium px-4 py-2 pointer-coarse:min-h-11 rounded-lg border border-border text-text-secondary bg-surface hover:bg-surface-hover cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-border-hover">
                  <Camera size={16} />
                  Take photo
                  <input
                    type="file" accept="image/*" capture="environment" multiple
                    className="sr-only" onChange={e => { handleFiles(e.target.files, 'LIVE'); e.target.value = ''; }}
                  />
                </label>

                <label className="flex items-center gap-2 text-sm font-medium px-4 py-2 pointer-coarse:min-h-11 rounded-lg border border-border text-text-secondary bg-surface hover:bg-surface-hover cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-border-hover">
                  <ImageIcon size={16} />
                  Gallery
                  <input
                    type="file" accept="image/*" multiple
                    className="sr-only" onChange={e => { handleFiles(e.target.files, 'GALLERY'); e.target.value = ''; }}
                  />
                </label>

                {uploadImages.isPending && <Loader2 size={18} className="animate-spin text-info ml-2" />}
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
                <button
                  type="button"
                  onClick={() => updateRemarks.mutate({ id: item.id, remarks })}
                  disabled={updateRemarks.isPending || !remarks.trim()}
                  className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 pointer-coarse:min-h-11 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  {updateRemarks.isPending && <Loader2 size={16} className="animate-spin" />}
                  Save remark
                </button>
              </div>
            </div>
            </>)}

            <div className="flex items-center gap-2">
              {!expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="inline-flex items-center gap-1.5 min-h-10 pointer-coarse:min-h-11 px-3 rounded-lg text-sm font-display font-semibold text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <MessageSquarePlus size={16} aria-hidden="true" />
                  Remark or photo
                </button>
              )}
              <button
                type="button"
                onClick={() => completeItem.mutate(item.id)}
                disabled={completeItem.isPending}
                className="ml-auto inline-flex items-center justify-center gap-2 min-h-10 pointer-coarse:min-h-11 px-4 rounded-lg bg-primary-600 text-white text-sm font-display font-semibold hover:bg-primary-700 active:scale-[0.985] cursor-pointer transition-[background-color,transform] duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {completeItem.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                Mark done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
