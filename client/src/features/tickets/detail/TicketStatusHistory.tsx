import { History, Camera, Eye } from 'lucide-react';
import { UPLOADS_BASE, DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from './detailConstants';
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
 * the newest is a white card tagged "Now". Each row: the move and "Ravi · 10 Oct 4:32 PM" on one
 * line, then the remark and any proof photos as small thumbnails (a camera mark on live ones).
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
    <section className="flex flex-col gap-2.5 min-w-0">
      <h3 className={DETAIL_SECTION_HEADING}>
        <span className={DETAIL_SECTION_TILE} aria-hidden="true"><History size={14} strokeWidth={2.25} /></span>
        Status history
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-hover px-1.5 t-meta font-semibold text-text-muted tabular-nums">{rows.length}</span>
      </h3>

      {/* A thin rail with a small disc per move in that status's colour. The newest move is the white, ringed card;
          older ones are quiet tinted rows. */}
      <ol className="relative flex flex-col gap-1.5 pl-8 before:absolute before:bottom-5 before:left-[11px] before:top-5 before:w-px before:bg-border">
        {rows.map((su, i) => {
          const key = su.toStatus.toLowerCase() as StatusChipStatus;
          const meta = getStatusChipMeta(key);
          const Icon = meta.icon;
          const latest = i === 0;

          return (
            <li key={su.id} className="relative">
              <span className={`absolute -left-8 top-2 z-10 flex size-6 items-center justify-center rounded-full text-white ring-[3px] ring-surface ${meta.tone}`} aria-hidden>
                <Icon size={12} strokeWidth={2.75} />
              </span>
              <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${latest ? 'border-primary-500/25 bg-surface' : 'border-border/50 bg-surface-hover/30'}`}>
                {/* One line: what happened on the left, who and when on the right (the name truncates first). */}
                <div className="flex items-baseline justify-between gap-3 min-w-0">
                  <p className="shrink-0 t-meta font-display font-semibold leading-snug text-text">
                    {rowLabel(su)}
                    {latest && <span className="ml-1.5 rounded-full bg-primary-500/10 px-1.5 py-px t-meta font-semibold text-primary-700 dark:text-primary-300">Now</span>}
                  </p>
                  <p className="min-w-0 truncate t-meta font-medium text-text-muted tabular-nums" title={su.author ? `${su.author}, ${formatStamp(su.createdAt)}` : undefined}>
                    {su.author ? `${su.author} · ` : ''}{formatStamp(su.createdAt)}
                  </p>
                </div>

                {su.remark && (
                  <p className="mt-0.5 border-l-2 border-border-hover pl-2 t-meta text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                    {su.remark}
                  </p>
                )}

                {su.photos && su.photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 max-w-xs pt-1">
                    {su.photos.map((photo) => {
                      const imageUrl = `${UPLOADS_BASE}${photo.url}`;
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => onPreview(imageUrl)}
                          className="group/photo relative aspect-square w-full rounded-md border border-border/60 overflow-hidden bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                          aria-label={photo.captureMethod === 'LIVE' ? 'Open photo taken with the camera' : 'Open photo'}
                        >
                          <img src={imageUrl} alt="Proof photo" loading="lazy" className="size-full object-cover" />
                          {photo.captureMethod === 'LIVE' && (
                            <span className="absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded bg-black/55 text-white" title="Taken with the camera">
                              <Camera size={10} aria-hidden />
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
            </li>
          );
        })}
      </ol>
    </section>
  );
};
