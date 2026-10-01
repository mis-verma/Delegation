import { History, ArrowRight, Camera, ImageUp, ImagePlus } from 'lucide-react';
import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { StatusChip, getStatusChipLabel, type StatusChipStatus } from '../../components/statusChip';
import { StatusPhotoThumbnail } from './detail/StatusPhotoThumbnail';
import type { Ticket, CaptureMethod } from '../../api/ticket';

interface TicketStatusRemarkDialogProps {
  ticket: Ticket;
  toStatus: Ticket['status'];
  onCancel: () => void;
  onConfirm: (remark: string) => void;
  isSubmitting?: boolean;
  nested?: boolean;
  /** Same optional proof-photo capture the non-verifier "Update Status" panel already has —
   *  state lives with the caller (TicketDetail) since it has to survive the confirm/cancel round
   *  trip and feed the same mutation the panel posts through. */
  photos?: File[];
  onAddPhotos?: (files: FileList | null, method: CaptureMethod) => void;
  onRemovePhoto?: (index: number) => void;
}

// `icon={false}` used to strip the colored icon circle from these — the only thing that actually
// carries each status's color on this chip (see IconChip) — so "Open" and "In Progress" rendered
// as identical plain gray pills here despite being color-coded everywhere else in the app. Keeping
// the default icon is what makes these "the latest chips" instead of a flattened-out copy of them.
const chip = (status: Ticket['status']) => {
  const key = status.toLowerCase() as StatusChipStatus;
  return <StatusChip status={key} label={getStatusChipLabel(key)} />;
};

// Short, not TicketStatusHistory's own full "Sep 17, 2026, 4:32 PM" — this sits inside a compact
// dialog next to a live textarea, not a dedicated history panel with room to spare.
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

// The last few status moves, right where the next one is being explained — so whoever's filling
// this in can see what already happened without cancelling out to scroll down to the ticket's own
// Status History section. Same StatusChip the from/to row above already uses, just smaller —
// "latest chips" throughout, not a different, older-looking list style underneath a modern header.
const HistoryPreview = ({ statusUpdates }: { statusUpdates: Ticket['statusUpdates'] }) => {
  const recent = (statusUpdates ?? []).slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-text-secondary tracking-tight">
        <History size={13} className="text-primary-500" />
        Recent history
      </span>
      <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
        {recent.map((su) => (
          <div
            key={su.id}
            className="flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-lg border border-border/60 bg-surface-hover/30 text-[11px]"
          >
            <StatusChip status={su.fromStatus.toLowerCase() as StatusChipStatus} label={getStatusChipLabel(su.fromStatus.toLowerCase() as StatusChipStatus)} />
            <ArrowRight size={10} strokeWidth={3} className="text-text-light shrink-0" />
            <StatusChip status={su.toStatus.toLowerCase() as StatusChipStatus} label={getStatusChipLabel(su.toStatus.toLowerCase() as StatusChipStatus)} />
            <span className="text-text-muted font-medium ml-auto shrink-0 tabular-nums">{relativeTime(su.createdAt)}</span>
            {su.remark && (
              <p className="basis-full text-text-secondary font-medium leading-snug truncate" title={su.remark}>
                "{su.remark}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Same Camera/Gallery capture the non-verifier "Update Status" panel offers — this popup was the
// one place a status change could be recorded with no way to attach the proof photo that goes
// with it, even though the mutation underneath (useAddTicketStatusUpdateMutation) already accepts
// files. Optional: only renders once the caller wires photo state through.
const PhotoAttachments = ({
  photos, onAddPhotos, onRemovePhoto,
}: {
  photos: File[];
  onAddPhotos: (files: FileList | null, method: CaptureMethod) => void;
  onRemovePhoto: (index: number) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="flex items-center gap-1.5 text-xs font-bold text-text-secondary tracking-tight">
      <ImagePlus size={13} className="text-primary-500" /> Photo (optional)
    </span>
    <div className="flex items-center gap-2 flex-wrap">
      <label className="inline-flex items-center justify-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border border-primary-500/30 text-primary-700 dark:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1 focus-within:ring-offset-background active:scale-95">
        <Camera size={14} strokeWidth={2.5} />
        <span>Camera</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => { onAddPhotos(e.target.files, 'LIVE'); e.target.value = ''; }}
        />
      </label>
      <label className="inline-flex items-center justify-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border border-border text-text-secondary bg-surface hover:bg-surface-hover cursor-pointer transition-all focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1 focus-within:ring-offset-background active:scale-95">
        <ImageUp size={14} strokeWidth={2.5} />
        <span>Gallery</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => { onAddPhotos(e.target.files, 'GALLERY'); e.target.value = ''; }}
        />
      </label>
    </div>
    {photos.length > 0 && (
      <div className="flex flex-wrap gap-2 pt-1">
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

/** Tickets' wording and chips over the shared StatusRemarkDialog — see TaskStatusRemarkDialog. */
export const TicketStatusRemarkDialog = ({
  ticket, toStatus, onCancel, onConfirm, isSubmitting, nested,
  photos, onAddPhotos, onRemovePhoto,
}: TicketStatusRemarkDialogProps) => (
  <StatusRemarkDialog
    itemTitle={ticket.title}
    from={chip(ticket.status)}
    to={chip(toStatus)}
    confirmLabel={toStatus === 'ON_HOLD' ? 'Put on hold' : `Move to ${getStatusChipLabel(toStatus.toLowerCase() as StatusChipStatus)}`}
    description="Say why it's on hold and when work should resume. Everyone working on this ticket sees it."
    placeholder="e.g. Waiting for the vendor's replacement part. Work resumes when it arrives."
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
