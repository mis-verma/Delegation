import { Check, Camera, ImageUp, Video, X, Loader2, RotateCcw } from 'lucide-react';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { ITEM_TYPE_ICON } from './checklistItemIcon';
import { ChecklistItemIconTile } from './ChecklistItemIconTile';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import type { CaptureMethod } from '../../../api/ticket';
import { formatDateTime, formatTimeOnly } from '../checklistDisplay';

const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

interface ChecklistInstanceItemCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean; // assignee or admin — allowed to upload/complete
  isLocked:   boolean; // instance already APPROVED — frozen, no further changes
}

const isVideoFile = (image: { mimeType: string }) => image.mimeType.startsWith('video/');

export const ChecklistInstanceItemCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceImageMutation(instanceId);
  const isVideoItem = item.itemType === 'VIDEO_UPLOAD';
  const mediaWord = isVideoItem ? 'video' : 'photo';

  const images = item.images ?? [];
  const qualifying = item.requiresLivePhoto
    ? images.filter(i => i.captureMethod === 'LIVE').length
    : images.length;
  const photosSatisfied = item.requiredImageCount > 0 && qualifying >= item.requiredImageCount;
  const interactive = canWork && !isLocked;

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod });
  };

  // Plain items with no photo requirement keep the original snappy "click anywhere to toggle"
  // interaction — no need for the fuller evidence-capture card below.
  if (item.requiredImageCount === 0) {
    return (
      <button
        type="button"
        disabled={!interactive || setItemDone.isPending}
        onClick={() => setItemDone.mutate({ itemId: item.id, isDone: !item.isDone })}
        aria-pressed={item.isDone}
        className={`group flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent] ${
          interactive ? 'cursor-pointer hover:border-primary-500/50 active:bg-surface-hover/50' : 'cursor-not-allowed opacity-75'
        } ${item.isDone ? 'border-border/40 dark:border-white/[0.04] bg-surface/60' : 'border-border/60 dark:border-white/[0.06] bg-surface'}`}
      >
        {/* Round check, same as the To-Do list: empty ring, green with a tick when done. */}
        <span
          className={`flex items-center justify-center size-6 rounded-full border-2 shrink-0 transition-all duration-200 ${
            item.isDone ? 'bg-success border-success text-white' : 'border-text-light text-transparent group-hover:text-text-light/70'
          }`}
        >
          <Check size={13} strokeWidth={3.25} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <p className={`text-sm sm:text-[15px] font-display font-medium leading-snug ${item.isDone ? 'line-through text-text-light' : 'text-text'}`}>
            {item.label}
          </p>
          {item.isDone && item.completedAt && (
            <p className="text-[11px] text-text-muted font-medium">Done {formatDateTime(item.completedAt)}</p>
          )}
        </div>
        {setItemDone.isPending && <Loader2 size={14} className="animate-spin text-text-muted shrink-0" />}
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      {/* Evidence requirement badge */}
      <div className="flex items-center gap-1.5">
        <span className={`flex items-center justify-center size-4 rounded shrink-0 ${photosSatisfied ? 'bg-success' : 'bg-warning'}`}>
          {isVideoItem ? <Video size={10} className="text-white" /> : <Camera size={10} className="text-white" />}
        </span>
        <span className="text-xs font-display text-text-muted truncate">
          {qualifying}/{item.requiredImageCount} {mediaWord}{item.requiredImageCount !== 1 ? 's' : ''}
          {item.requiresLivePhoto ? ' (live only)' : ''}
          {item.maxImageCount != null ? ` · max ${item.maxImageCount}` : ''}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3">
        <ChecklistItemIconTile icon={ITEM_TYPE_ICON[item.itemType]} done={item.isDone} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-display font-medium leading-snug ${item.isDone ? 'line-through text-text-muted' : 'text-text'}`}>
            {item.label}
          </p>
          {item.isDone && item.completedAt && (
            <p className="text-xs text-text-muted font-display mt-1">Completed {formatDateTime(item.completedAt)}</p>
          )}
        </div>
        {interactive && item.isDone && (
          <button
            onClick={() => setItemDone.mutate({ itemId: item.id, isDone: false })}
            disabled={setItemDone.isPending}
            className="shrink-0 p-2 rounded-md text-text-light hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
            aria-label="Reopen item"
            title="Reopen"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Evidence media strip */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(img => (
            <div key={img.id} className="relative">
              {isVideoFile(img) ? (
                <video
                  src={`${UPLOADS_BASE}${img.url}`}
                  className="size-16 object-cover rounded-lg border border-border bg-surface-hover"
                  muted
                  playsInline
                  controls
                />
              ) : (
                <img
                  src={`${UPLOADS_BASE}${img.url}`}
                  alt={img.originalFilename ?? 'evidence'}
                  className="size-16 object-cover rounded-lg border border-border"
                />
              )}
              <span className={`absolute -top-1 -left-1 text-[9px] font-display px-1 rounded-full text-white ${
                img.captureMethod === 'LIVE' ? 'bg-success' : 'bg-text-light'
              }`}>
                {img.captureMethod === 'LIVE' ? 'Live' : 'Gallery'}
              </span>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-display font-medium px-1 rounded-full bg-black/70 text-white whitespace-nowrap">
                {formatTimeOnly(img.createdAt)}
              </span>
              {interactive && (
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

      {interactive && !item.isDone && (
        <div className="flex flex-col gap-2">
          {uploadImages.isError && (
            <p className="text-xs text-danger">
              {uploadImages.error instanceof Error ? uploadImages.error.message : "Couldn't upload that."}
            </p>
          )}
          {setItemDone.isError && (
            <p className="text-xs text-danger">
              {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't mark this done."}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <label className="flex items-center gap-1.5 text-xs font-display font-medium px-3 py-1.5 rounded-lg border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1">
              {isVideoItem ? <Video size={12} /> : <Camera size={12} />}
              {isVideoItem ? 'Record video' : 'Take photo'}
              <input
                type="file"
                accept={isVideoItem ? 'video/*' : 'image/*'}
                capture="environment"
                multiple
                className="sr-only"
                onChange={e => { handleFiles(e.target.files, 'LIVE'); e.target.value = ''; }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-display font-medium px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1">
              <ImageUp size={12} />
              {isVideoItem ? 'Choose video' : 'Gallery'}
              <input
                type="file"
                accept={isVideoItem ? 'video/*' : 'image/*'}
                multiple
                className="sr-only"
                onChange={e => { handleFiles(e.target.files, 'GALLERY'); e.target.value = ''; }}
              />
            </label>
            {uploadImages.isPending && <Loader2 size={13} className="animate-spin text-text-muted" />}

            <button
              onClick={() => setItemDone.mutate({ itemId: item.id, isDone: true })}
              disabled={setItemDone.isPending}
              className="flex items-center gap-1.5 text-xs font-display font-medium px-3 py-1.5 rounded-lg border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 ml-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
              Mark complete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
