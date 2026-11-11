import { Camera, ImageUp } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { IconChip } from '../../../components';
import { passingPhotos } from '../photoQuality';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import { EvidenceThumb } from './EvidenceThumb';
import { CaptureButton, UploadingHint } from './CaptureButton';
import { MAX_LIVE_PHOTOS } from './cameraSupport';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import type { CaptureMethod } from '../../../api/ticket';

interface RetakePhotoPanelProps {
  item: ChecklistInstanceItem;
  instanceId: string;
}

export const RetakePhotoPanel = ({ item, instanceId }: RetakePhotoPanelProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceImageMutation(instanceId);

  const fresh = passingPhotos((item.images ?? []).filter((i) => i.purpose === 'GENERAL'));
  const qualifying = item.requiresLivePhoto ? fresh.filter((i) => i.captureMethod === 'LIVE').length : fresh.length;
  const needed = Math.max(1, item.requiredImageCount);
  const ready = qualifying >= needed;

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border/50 bg-surface-hover/30 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-card font-display font-semibold text-text">Retake the photo</p>
        <IconChip
          icon={Camera}
          tone={ready ? 'bg-success' : 'bg-warning'}
          label={`${qualifying}/${needed} new ${item.requiresLivePhoto ? 'live ' : ''}${needed === 1 ? 'photo' : 'photos'}`}
        />
      </div>
      <p className="t-meta text-text-secondary">Your answer stays as it is. Add as many clear photos as you need. Nothing is sent until you tap Send new photo.</p>

      {fresh.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fresh.map((img) => (
            <EvidenceThumb key={img.id} image={img} siblings={fresh} onDelete={deleteImage.mutate} deleting={deleteImage.isPending && deleteImage.variables === img.id} />
          ))}
        </div>
      )}

      <ItemError error={uploadImages.error} fallback="Couldn't upload that." />
      <ItemError error={setItemDone.error} fallback="Couldn't send the new photo." />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CaptureButton icon={Camera} label="Take photo" ariaLabel={`Take photo: ${item.label}`} live burst limit={Math.max(0, Math.min(item.maxImageCount ?? MAX_LIVE_PHOTOS, MAX_LIVE_PHOTOS) - fresh.length)} accept="image/*" disabled={uploadImages.isPending} onFiles={(files) => handleFiles(files, 'LIVE')} />
          {!item.requiresLivePhoto && (
            <CaptureButton icon={ImageUp} label="Gallery" ariaLabel={`Gallery photo: ${item.label}`} live={false} accept="image/*" disabled={uploadImages.isPending} onFiles={(files) => handleFiles(files, 'GALLERY')} />
          )}
          {uploadImages.isPending && <UploadingHint progress={uploadImages.progress} />}
        </div>
        <ItemActionButton
          disabled={!ready || uploadImages.isPending}
          aria-label={`Send new photo: ${item.label}`}
          onClick={() => { haptic('tap'); setItemDone.mutate({ itemId: item.id, isDone: true }); }}
          isLoading={setItemDone.isPending}
        >
          Send new photo
        </ItemActionButton>
      </div>
    </div>
  );
};
