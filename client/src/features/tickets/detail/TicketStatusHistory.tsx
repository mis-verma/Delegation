import { History, Camera, Eye } from 'lucide-react';
import { UPLOADS_BASE, DETAIL_SECTION_HEADING } from './detailConstants';
import { getStatusChipMeta, type StatusChipStatus } from '../../../components/statusChip';
import { TICKET_STATUS_LABEL } from '../../../lib/ticketStatusLabel';
import type { TicketStatusUpdate } from '../../../api/ticket';

interface TicketStatusHistoryProps {
  statusUpdates: TicketStatusUpdate[];
  onPreview: (url: string) => void;
  /**
   * Closing a ticket happens through approval, not through a status move, so it is never one of the
   * `statusUpdates` rows (the last row would still read "Waiting for approval" on a closed ticket).
   * Pass this to show the closing as the newest step.
   */
  closure?: { at: string; by: string | null; note: string | null } | null;
}

type HistoryRow = Pick<TicketStatusUpdate, 'id' | 'toStatus' | 'createdAt' | 'remark' | 'photos'> & {
  fromStatus: TicketStatusUpdate['fromStatus'] | null;
  author: string | undefined;
};

/** "10 Oct 4:32 PM", with the year only when it isn't this year. */
const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
};

// A reviewer's send-back is recorded as a move from Waiting for approval to In progress; it reads
// better as what it was.
const rowLabel = (row: HistoryRow) =>
  row.fromStatus === 'PENDING_APPROVAL' && row.toStatus === 'IN_PROGRESS'
    ? 'Sent back'
    : row.toStatus === 'PENDING_APPROVAL'
      ? 'Marked completed'
      : TICKET_STATUS_LABEL[row.toStatus as keyof typeof TICKET_STATUS_LABEL] ?? row.toStatus;

/**
 * Every status move, newest first, on one quiet rail. Each move gets its status's own icon circle;
 * the newest sits in a plain bordered card. Under each: "Ravi, 10 Oct 4:32 PM", the remark, and
 * any proof photos as small thumbnails (a "Camera" tag on the ones taken live).
 */
export const TicketStatusHistory = ({ statusUpdates, onPreview, closure }: TicketStatusHistoryProps) => {
  const rows: HistoryRow[] = [
    ...(closure
      ? [{ id: 'closed', fromStatus: null, toStatus: 'CLOSED' as TicketStatusUpdate['toStatus'], createdAt: closure.at, remark: closure.note ?? '', photos: [], author: closure.by ?? undefined }]
      : []),
    ...(statusUpdates ?? []).map((su) => ({ id: su.id, fromStatus: su.fromStatus, toStatus: su.toStatus, createdAt: su.createdAt, remark: su.remark, photos: su.photos, author: su.changedByUser?.firstName })),
  ];
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 min-w-0">
      <h3 className={DETAIL_SECTION_HEADING}>
        <History size={16} className="text-text-light" aria-hidden />
        Status history
      </h3>

      <ol className="flex flex-col">
        {rows.map((su, index) => {
          const key = su.toStatus.toLowerCase() as StatusChipStatus;
          const meta = getStatusChipMeta(key);
          const Icon = meta.icon;
          const isLatest = index === 0;
          const isLast = index === rows.length - 1;
          const stamp = su.author ? `${su.author}, ${formatStamp(su.createdAt)}` : formatStamp(su.createdAt);

          return (
            <li key={su.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`flex items-center justify-center size-7 rounded-full text-white shrink-0 ${meta.tone}`}>
                  <Icon size={14} strokeWidth={2.5} aria-hidden />
                </span>
                {!isLast && <span className="w-px flex-1 min-h-5 my-1 bg-border" aria-hidden />}
              </div>

              <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
                <div className={`flex flex-col gap-1.5 ${isLatest ? 'rounded-lg border border-border/70 px-3 py-2.5 -mt-1' : 'pt-1'}`}>
                  <p className="t-card font-display font-semibold leading-tight text-text">{rowLabel(su)}</p>
                  <p className="t-meta font-medium text-text-muted tabular-nums break-words">{stamp}</p>

                  {su.remark && (
                    <p className="t-card text-text-secondary leading-relaxed whitespace-pre-wrap break-words pl-2.5 border-l-2 border-border">
                      {su.remark}
                    </p>
                  )}

                  {su.photos && su.photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 max-w-sm pt-1">
                      {su.photos.map((photo) => {
                        const imageUrl = `${UPLOADS_BASE}${photo.url}`;
                        return (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => onPreview(imageUrl)}
                            className="group/photo relative aspect-square w-full rounded-lg border border-border/60 overflow-hidden bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                            aria-label={photo.captureMethod === 'LIVE' ? 'Open photo taken with the camera' : 'Open photo'}
                          >
                            <img src={imageUrl} alt="Proof photo" loading="lazy" className="size-full object-cover" />
                            {photo.captureMethod === 'LIVE' && (
                              <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-0.5 t-meta font-semibold text-text">
                                <Camera size={12} aria-hidden />
                                Camera
                              </span>
                            )}
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity duration-200 flex items-center justify-center text-white" aria-hidden>
                              <Eye size={16} strokeWidth={2.5} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
