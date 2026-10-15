import { useRef } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { useConfirm } from '@/components/confirmDialog';
import { useUploadTicketAttachmentsMutation, useDeleteTicketAttachmentMutation } from '../hook';
import { UPLOADS_BASE, DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from './detailConstants';
import type { TicketAttachment } from '../../../api/ticket';

interface TicketAttachmentsProps {
  ticketId: string;
  attachments: TicketAttachment[];
  /** Adds the "Add photo" tile. */
  canEdit: boolean;
  /** Whether this photo gets a remove button. Same rule as the server: proof photos sent with a
   *  status change and photos on a closed ticket stay, except for an Admin. */
  canRemove: (attachment: TicketAttachment) => boolean;
  onPreview: (url: string) => void;
}

/**
 * The photos that belong to the ticket itself, added when it was raised or later. Proof photos
 * that come with a status change stay in the History list. Hidden when there is nothing to show
 * and nothing the viewer could add.
 */
export const TicketAttachments = ({ ticketId, attachments, canEdit, canRemove, onPreview }: TicketAttachmentsProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadTicketAttachmentsMutation(ticketId);
  const remove = useDeleteTicketAttachmentMutation();
  const confirm = useConfirm();

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

  return (
    <section className="flex flex-col gap-2" aria-label="Photos">
      <h3 className={DETAIL_SECTION_HEADING}>
        <span className={DETAIL_SECTION_TILE} aria-hidden="true"><Camera size={16} strokeWidth={2.25} /></span>
        Photos
        {attachments.length > 0 && <span className="tabular-nums font-medium text-text-light">({attachments.length})</span>}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2">
        {attachments.map((a) => {
          const url = `${UPLOADS_BASE}${a.url}`;
          return (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-hover">
              <button
                type="button"
                onClick={() => onPreview(url)}
                className="size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                aria-label={`Open photo ${a.originalFilename ?? ''}`.trim()}
              >
                <img src={url} alt={a.originalFilename ?? 'Ticket photo'} loading="lazy" className="size-full object-cover" />
              </button>
              {a.captureMethod === 'LIVE' && (
                <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-0.5 t-meta font-semibold text-text">
                  <Camera size={12} aria-hidden />
                  Camera
                </span>
              )}
              {canRemove(a) && (
                <button
                  type="button"
                  onClick={() => handleRemove(a)}
                  disabled={remove.isPending}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 flex items-center justify-center size-8 rounded-full bg-surface text-text-muted hover:text-danger border border-border/50 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger after:absolute after:-inset-1.5"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          );
        })}

        {canEdit && (
          <>
            {/* No capture attribute: on a phone the picker offers both camera and gallery. */}
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className={attachments.length === 0
                ? 'col-span-full flex h-14 items-center gap-3 rounded-xl border border-border bg-surface-hover/30 px-3 text-text-secondary hover:border-border-hover hover:text-text t-card font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-60 disabled:cursor-wait'
                : 'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-border text-text-muted hover:border-border-hover hover:text-text t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-60 disabled:cursor-wait'}
            >
              {upload.isPending ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              {upload.isPending ? 'Adding…' : 'Add photo'}
            </button>
          </>
        )}
      </div>
    </section>
  );
};
