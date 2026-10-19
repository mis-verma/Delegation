import { memo } from 'react';
import { haptic } from '../../../lib/haptics';
import { Check, Camera, ImageUp, Video } from 'lucide-react';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { IconChip, PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';
import { useCanReopen } from './useCanReopen';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import { EvidenceThumb } from './EvidenceThumb';
import { CaptureButton, UploadingHint } from './CaptureButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import type { CaptureMethod } from '../../../api/ticket';
import { formatDateTime } from '../checklistDisplay';

interface ChecklistInstanceItemCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemCard = memo(function ChecklistInstanceItemCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemCardProps) {
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
  const canReopen = useCanReopen();
  const canToggle = interactive && (!item.isDone || canReopen);

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod });
  };

  if (item.requiredImageCount === 0) {
    return (
      <button
        type="button"
        disabled={!canToggle}
        onClick={() => { haptic('tap'); setItemDone.mutate({ itemId: item.id, isDone: !item.isDone }); }}
        aria-pressed={item.isDone}
        aria-busy={setItemDone.isPending}
        title={interactive && !canToggle ? 'Done. Only an admin can reopen this.' : undefined}
        className={cn(
          PANEL_CLASS,
          'group flex items-center gap-3 p-3.5 sm:p-4 text-left transition-colors duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]',
          canToggle ? 'cursor-pointer hover:border-primary-500/50 active:bg-surface-hover/50' : interactive ? 'cursor-default' : 'cursor-not-allowed opacity-75',
          item.isDone && 'border-border/40 bg-surface/60',
        )}
      >
        <span
          className={`flex items-center justify-center size-6 rounded-full border-2 shrink-0 transition-colors duration-200 ${
            item.isDone ? 'bg-success border-success text-white' : 'border-text-light text-transparent group-hover:text-text-light/70'
          }`}
        >
          <Check size={13} strokeWidth={3.25} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <p className={`text-sm sm:t-card font-display font-medium leading-snug ${item.isDone ? 'line-through text-text-light' : 'text-text'}`}>
            {item.label}
          </p>
          {item.isDone && item.completedAt && (
            <p className="t-meta text-text-muted font-medium">Completed {formatDateTime(item.completedAt)}</p>
          )}
        </div>
      </button>
    );
  }

  return (
    <ItemCardShell isLocked={isLocked}>
      <IconChip
        icon={isVideoItem ? Video : Camera}
        tone={photosSatisfied ? 'bg-success' : 'bg-warning'}
        className="self-start max-w-full"
        label={
          <>
            {qualifying}/{item.requiredImageCount} {mediaWord}{item.requiredImageCount !== 1 ? 's' : ''}
            {item.requiresLivePhoto ? ' (live only)' : ''}
            {item.maxImageCount != null ? ` · max ${item.maxImageCount}` : ''}
          </>
        }
      />

      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false })}
      />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(img => (
            <EvidenceThumb
              key={img.id}
              image={img}
              onDelete={interactive && !item.isDone ? deleteImage.mutate : undefined}
              deleting={deleteImage.isPending}
            />
          ))}
        </div>
      )}

      {interactive && !item.isDone && (
        <div className="flex flex-col gap-2">
          <ItemError error={uploadImages.error} fallback="Couldn't upload that." />
          <ItemError error={setItemDone.error} fallback="Couldn't mark this done." />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CaptureButton
                icon={isVideoItem ? Video : Camera}
                label={isVideoItem ? 'Record video' : 'Take photo'}
                live
                accept={isVideoItem ? 'video/*' : 'image/*'}
                onFiles={files => handleFiles(files, 'LIVE')}
              />
              <CaptureButton
                icon={ImageUp}
                label={isVideoItem ? 'Choose video' : 'Gallery'}
                live={false}
                accept={isVideoItem ? 'video/*' : 'image/*'}
                onFiles={files => handleFiles(files, 'GALLERY')}
              />
              {uploadImages.isPending && <UploadingHint />}
            </div>

            <ItemActionButton
              onClick={() => { haptic('tap'); setItemDone.mutate({ itemId: item.id, isDone: true }); }}
              isLoading={setItemDone.isPending}
            >
              Mark complete
            </ItemActionButton>
          </div>
        </div>
      )}
    </ItemCardShell>
  );
});
