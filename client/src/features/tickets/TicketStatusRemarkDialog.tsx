import { useLiveOnlyAttachments } from '../../lib/useLiveOnlyAttachments';
import { LivePhotoTrigger } from '../checklist/instance/LivePhotoTrigger';
import { History, ArrowRight, Camera, ImageUp, ImagePlus } from 'lucide-react';
import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { StatusChip, type StatusChipStatus } from '../../components/statusChip';
import { StatusPhotoThumbnail } from './detail/StatusPhotoThumbnail';
import { HAND_IN_LABEL } from './detail/detailConstants';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import type { Ticket, CaptureMethod } from '../../api/ticket';

interface TicketStatusRemarkDialogProps {
  ticket: Ticket;
  toStatus: Ticket['status'];
  onCancel: () => void;
  onConfirm: (remark: string) => void;
  isSubmitting?: boolean;
  nested?: boolean;
  photos?: File[];
  onAddPhotos?: (files: FileList | null, method: CaptureMethod) => void;
  onRemovePhoto?: (index: number) => void;
}

const chip = (status: Ticket['status']) => (
  <StatusChip status={status.toLowerCase() as StatusChipStatus} label={getTicketStatusLabel(status)} />
);

const relativeTime = (isoDate: string) => {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const HistoryPreview = ({ statusUpdates }: { statusUpdates: Ticket['statusUpdates'] }) => {
  const recent = (statusUpdates ?? []).slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
        <History size={14} className="text-text-light" aria-hidden />
        Recent history
      </span>
      <div className="flex flex-col gap-1.5">
        {recent.map((su) => (
          <div
            key={su.id}
            className="flex items-center gap-1.5 flex-wrap px-2.5 py-1.5 rounded-lg border border-border/50 bg-surface-hover/30 t-meta"
          >
            {chip(su.fromStatus)}
            <ArrowRight size={12} strokeWidth={2.75} className="text-text-light shrink-0" aria-hidden />
            {chip(su.toStatus)}
            <span className="text-text-muted font-medium ml-auto shrink-0 tabular-nums">{relativeTime(su.createdAt)}</span>
            {su.remark && (
              <p className="basis-full min-w-0 border-l-2 border-border-hover pl-2 text-text-secondary leading-snug break-words line-clamp-2" title={su.remark}>
                {su.remark}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const PHOTO_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 t-meta font-display font-semibold px-3 h-10 sm:h-9 rounded-lg border border-dashed border-border-hover text-text-secondary bg-surface-hover/30 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-500/5 cursor-pointer transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary-500/40 [&_svg]:text-primary-600 dark:[&_svg]:text-primary-300';

export const PhotoAttachments = ({
  photos, onAddPhotos, onRemovePhoto,
}: {
  photos: File[];
  onAddPhotos: (files: FileList | null, method: CaptureMethod) => void;
  onRemovePhoto: (index: number) => void;
}) => {
  const liveOnly = useLiveOnlyAttachments();
  return (
  <div className="flex flex-col gap-1.5">
    <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
      <ImagePlus size={14} className="text-text-light" aria-hidden /> Photo (optional)
    </span>
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <LivePhotoTrigger className={PHOTO_BUTTON_CLASS} onFiles={(files) => onAddPhotos(files, 'LIVE')}>
        <Camera size={14} strokeWidth={2.5} />
        <span>Camera</span>
      </LivePhotoTrigger>
      {!liveOnly && <label className={PHOTO_BUTTON_CLASS}>
        <ImageUp size={14} strokeWidth={2.5} />
        <span>Gallery</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => { onAddPhotos(e.target.files, 'GALLERY'); e.target.value = ''; }}
        />
      </label>}
    </div>
    {photos.length > 0 && (
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 pt-1">
        {photos.map((file, index) => (
          <StatusPhotoThumbnail
            key={`${file.name}-${file.lastModified}-${index}`}
            file={file}
            index={index}
            onRemove={onRemovePhoto}
          />
        ))}
      </div>
    )}
  </div>
  );
};

const ON_HOLD_SUGGESTIONS = ['Waiting for parts', 'Waiting for vendor', 'Waiting for customer', 'Need approval from manager'];

export const TicketStatusRemarkDialog = ({
  ticket, toStatus, onCancel, onConfirm, isSubmitting, nested,
  photos, onAddPhotos, onRemovePhoto,
}: TicketStatusRemarkDialogProps) => {
  const handIn = toStatus === 'PENDING_APPROVAL';
  const onHold = toStatus === 'ON_HOLD';
  return (
    <StatusRemarkDialog
      itemTitle={ticket.title}
      from={chip(ticket.status)}
      to={chip(toStatus)}
      title={onHold ? 'Why is it on hold?' : handIn ? `${HAND_IN_LABEL}?` : undefined}
      confirmLabel={onHold ? 'Put on hold' : handIn ? HAND_IN_LABEL : `Move to ${getTicketStatusLabel(toStatus)}`}
      optional={!onHold && !handIn}
      description={onHold
        ? 'Say why and when work should start again. Everyone working on this ticket sees it.'
        : handIn
          ? 'It goes to PC for approval. Say what was done so they can check it.'
          : 'Add a note if you want to. You can also move it without one.'}
      phoneNote={onHold ? 'The due time keeps running while it is on hold.' : handIn ? 'It goes to PC for approval. Say what was done.' : undefined}
      suggestions={onHold ? ON_HOLD_SUGGESTIONS : undefined}
      placeholder={onHold
        ? "e.g. Waiting for the vendor's replacement part. Work starts again when it arrives."
        : handIn ? 'e.g. Replaced the cable and printed a test page. Everything works.' : 'e.g. Replaced the printer cable and tested a print. Working again.'}
      onCancel={onCancel}
      onConfirm={onConfirm}
      isSubmitting={isSubmitting}
      nested={nested}
      attachments={photos && onAddPhotos && onRemovePhoto && (
        <PhotoAttachments photos={photos} onAddPhotos={onAddPhotos} onRemovePhoto={onRemovePhoto} />
      )}
      history={<HistoryPreview statusUpdates={ticket.statusUpdates} />}
    />
  );
};
