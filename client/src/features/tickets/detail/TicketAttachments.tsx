import { useRef, useState } from 'react';
import { LiveCameraDialog } from '../../checklist/instance/LiveCameraDialog';
import { needsDesktopCamera } from '../../checklist/instance/cameraSupport';
import { useLiveOnlyAttachments } from '../../../lib/useLiveOnlyAttachments';
import { usePublicSettingsQuery } from '../../../lib/maintenance';
import { reportDropped, screenFiles, ticketPhotoRule } from '../../../lib/attachmentRules';
import { useFileDrop } from '../../../lib/useFileDrop';
import { Camera, ImagePlus, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/confirmDialog';
import { AttachmentGrid, ATTACHMENT_TILE_CLASS, type AttachmentGridItem } from '@/components/attachmentGrid';
import { UploadProgress } from '@/components/uploadProgress';
import { useUploadTicketAttachmentsMutation, useDeleteTicketAttachmentMutation } from '../hook';
import { UPLOADS_BASE, DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from './detailConstants';
import type { TicketAttachment } from '../../../api/ticket';

interface TicketAttachmentsProps {
  ticketId: string;
  attachments: TicketAttachment[];
  canEdit: boolean;
  canRemove: (attachment: TicketAttachment) => boolean;
  onPreview: (url: string) => void;
}

const PHOTO_NOUN = { one: 'photo', many: 'photos' };

export const TicketAttachments = ({ ticketId, attachments, canEdit, canRemove, onPreview }: TicketAttachmentsProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(0);
  const upload = useUploadTicketAttachmentsMutation(ticketId, setProgress);
  const remove = useDeleteTicketAttachmentMutation();
  const confirm = useConfirm();
  const liveOnly = useLiveOnlyAttachments();
  const { data: publicSettings } = usePublicSettingsQuery();
  const rule = ticketPhotoRule(publicSettings);
  const [cameraOpen, setCameraOpen] = useState(false);

  const send = (list: File[]) => {
    if (upload.isPending) return;
    const files = screenFiles(list, rule);
    if (!files.length) return;
    setSending(files.length);
    setProgress(0);
    upload.mutate(files, {
      onSuccess: (res) => reportDropped(files.length, res.data.length, rule),
      onSettled: () => setProgress(null),
    });
  };

  const drop = useFileDrop(send, canEdit && !liveOnly && !upload.isPending);

  if (attachments.length === 0 && !canEdit) return null;

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) send(files);
  };

  const handleRemove = async (attachment: TicketAttachment) => {
    const ok = await confirm({
      title: 'Remove this photo?',
      description: 'It will be taken off the ticket for everyone.',
      confirmLabel: 'Remove photo',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) remove.mutate(attachment.id);
  };

  const gridItems: AttachmentGridItem[] = attachments.map((a) => ({
    id: a.id,
    url: `${UPLOADS_BASE}${a.url}`,
    mimeType: a.mimeType,
    name: a.originalFilename,
    live: a.captureMethod === 'LIVE',
  }));
  const byId = new Map(attachments.map((a) => [a.id, a]));

  const openPicker = () => (liveOnly && needsDesktopCamera(true, 'image/*') ? setCameraOpen(true) : inputRef.current?.click());

  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-xl transition-colors duration-150 ease-out',
        drop.active && 'bg-primary-500/5 outline-2 outline-dashed outline-offset-4 outline-primary-400',
      )}
      aria-label="Photos"
      {...drop.bind}
    >
      <h3 className={DETAIL_SECTION_HEADING}>
        <span className={DETAIL_SECTION_TILE} aria-hidden="true"><Camera size={14} strokeWidth={2.25} /></span>
        Photos
        {attachments.length > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-hover px-1.5 t-meta font-semibold text-text-muted tabular-nums">
            {attachments.length}
          </span>
        )}
      </h3>

      {canEdit && <input ref={inputRef} type="file" accept="image/*" capture={liveOnly ? 'environment' : undefined} multiple className="hidden" onChange={handleFiles} />}
      {cameraOpen && <LiveCameraDialog open onClose={() => setCameraOpen(false)} onCapture={(file) => send([file])} />}

      {attachments.length === 0 ? (
        <button
          type="button"
          onClick={openPicker}
          disabled={upload.isPending}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border-hover bg-surface-hover/30 px-3 py-2.5 text-left hover:border-primary-400 hover:bg-primary-500/5 active:scale-[0.985] transition-[border-color,background-color,transform] duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-60 disabled:cursor-wait"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-300" aria-hidden="true">
            {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} strokeWidth={2.25} />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="t-meta font-display font-semibold text-text">{upload.isPending ? 'Adding photos…' : 'Add photo'}</span>
            <span className="t-meta text-text-muted">
              {liveOnly ? 'Take one with the camera' : 'Take one, pick from the gallery, or drop photos here'}
            </span>
          </span>
        </button>
      ) : (
        <AttachmentGrid
          items={gridItems}
          onOpen={(item) => onPreview(item.url)}
          canRemove={(item) => { const a = byId.get(item.id); return !!a && canRemove(a); }}
          onRemove={(item) => { const a = byId.get(item.id); if (a) void handleRemove(a); }}
          removing={remove.isPending}
          trailing={canEdit ? (
            <button
              type="button"
              onClick={openPicker}
              disabled={upload.isPending}
              aria-label="Add photo"
              className={`flex ${ATTACHMENT_TILE_CLASS} flex-col items-center justify-center gap-1 border border-dashed border-border-hover bg-surface-hover/30 text-text-muted hover:border-primary-400 hover:text-primary-600 hover:bg-primary-500/5 active:scale-[0.985] t-meta font-display font-semibold transition-[border-color,background-color,color,transform] duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-60 disabled:cursor-wait`}
            >
              {upload.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} strokeWidth={2.5} aria-hidden />}
              {upload.isPending ? 'Adding' : 'Add'}
            </button>
          ) : undefined}
        />
      )}

      {upload.isPending && <UploadProgress count={sending} fraction={progress} noun={PHOTO_NOUN} />}
    </section>
  );
};
