import { useRef, useState } from 'react';
import { LiveCameraDialog } from '../../checklist/instance/LiveCameraDialog';
import { needsDesktopCamera } from '../../checklist/instance/cameraSupport';
import { useLiveOnlyAttachments } from '../../../lib/useLiveOnlyAttachments';
import { Camera, ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { useConfirm } from '@/components/confirmDialog';
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

export const TicketAttachments = ({ ticketId, attachments, canEdit, canRemove, onPreview }: TicketAttachmentsProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadTicketAttachmentsMutation(ticketId);
  const remove = useDeleteTicketAttachmentMutation();
  const confirm = useConfirm();
  const liveOnly = useLiveOnlyAttachments();
  const [cameraOpen, setCameraOpen] = useState(false);

  if (attachments.length === 0 && !canEdit) return null;

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) upload.mutate(files);
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

  const openPicker = () => (liveOnly && needsDesktopCamera(true, 'image/*') ? setCameraOpen(true) : inputRef.current?.click());

  return (
    <section className="flex flex-col gap-2" aria-label="Photos">
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
      {cameraOpen && <LiveCameraDialog open onClose={() => setCameraOpen(false)} onCapture={(file) => upload.mutate([file])} />}

      {attachments.length === 0 ? (
        <button
          type="button"
          onClick={openPicker}
          disabled={upload.isPending}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border-hover bg-surface-hover/30 px-3 py-2.5 text-left hover:border-primary-400 hover:bg-primary-500/5 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-60 disabled:cursor-wait"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-300" aria-hidden="true">
            {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} strokeWidth={2.25} />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="t-meta font-display font-semibold text-text">{upload.isPending ? 'Adding photos…' : 'Add photo'}</span>
            <span className="t-meta text-text-muted">{liveOnly ? 'Take one with the camera' : 'Take one or pick from the gallery'}</span>
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2">
          {attachments.map((a) => {
            const url = `${UPLOADS_BASE}${a.url}`;
            return (
              <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-surface-hover">
                <button
                  type="button"
                  onClick={() => onPreview(url)}
                  className="size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  aria-label={`Open photo ${a.originalFilename ?? ''}`.trim()}
                >
                  <img src={url} alt={a.originalFilename ?? 'Ticket photo'} loading="lazy" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                </button>
                {a.captureMethod === 'LIVE' && (
                  <span className="pointer-events-none absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-md bg-black/55 text-white" title="Taken with the camera">
                    <Camera size={11} aria-hidden />
                    <span className="sr-only">Taken with the camera</span>
                  </span>
                )}
                {canRemove(a) && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a)}
                    disabled={remove.isPending}
                    aria-label="Remove photo"
                    className="absolute top-1 right-1 flex items-center justify-center size-6 rounded-full bg-black/55 text-white hover:bg-danger opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 transition-[opacity,background-color] duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger after:absolute after:-inset-2"
                  >
                    <X size={12} strokeWidth={2.75} />
                  </button>
                )}
              </div>
            );
          })}

          {canEdit && (
            <button
              type="button"
              onClick={openPicker}
              disabled={upload.isPending}
              aria-label="Add photo"
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-hover bg-surface-hover/30 text-text-muted hover:border-primary-400 hover:text-primary-600 hover:bg-primary-500/5 t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-60 disabled:cursor-wait"
            >
              {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
              {upload.isPending ? 'Adding' : 'Add'}
            </button>
          )}
        </div>
      )}
    </section>
  );
};
