import { History, Camera, Eye } from 'lucide-react';
import { UPLOADS_BASE } from './detailConstants';
import { getStatusChipLabel, getStatusChipMeta, type StatusChipStatus } from '../../../components/statusChip';
import { DETAIL_HEADING_CLASS } from '../../tasks/taskFormFieldStyles';
import type { TicketStatusUpdate } from '../../../api/ticket';

interface TicketStatusHistoryProps {
  statusUpdates: TicketStatusUpdate[];
  onPreview: (url: string) => void;
}

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
};

/**
 * Every status move, newest first, on one rail: same design as the delegation sheet's Progress
 * stepper. Each move gets its status's own icon circle; the latest one has a soft ring and sits in
 * a tinted card marked "Latest". The remark is a quote line under the name and time, and any proof
 * photos are thumbnails below it.
 */
export const TicketStatusHistory = ({ statusUpdates, onPreview }: TicketStatusHistoryProps) => {
  if (!statusUpdates || statusUpdates.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 min-w-0">
      <h3 className={DETAIL_HEADING_CLASS}>
        <History size={14} className="text-text-light" />
        Status history
      </h3>

      <ol className="flex flex-col">
        {statusUpdates.map((su, index) => {
          const key = su.toStatus.toLowerCase() as StatusChipStatus;
          const meta = getStatusChipMeta(key);
          const Icon = meta.icon;
          const isLatest = index === 0;
          const isLast = index === statusUpdates.length - 1;
          const author = su.changedByUser?.firstName;

          return (
            <li key={su.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex items-center justify-center size-7 rounded-full text-white shrink-0 ${meta.tone} ${
                    isLatest ? 'ring-4 ring-primary-500/15' : 'opacity-80'
                  }`}
                >
                  <Icon size={13} strokeWidth={2.5} />
                </span>
                {!isLast && <span className="w-0.5 flex-1 min-h-5 my-1 rounded-full bg-border" />}
              </div>

              <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
                <div
                  className={`flex flex-col gap-1.5 ${
                    isLatest
                      ? 'rounded-xl border border-primary-500/20 dark:border-primary-400/20 bg-primary-500/5 dark:bg-primary-500/10 px-3 py-2.5 -mt-1'
                      : 'pt-1'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-display font-semibold tracking-tight leading-tight text-text">
                      {getStatusChipLabel(key)}
                    </p>
                    {isLatest && (
                      <span className="px-2 py-0.5 rounded-full bg-primary-700 text-white text-[10px] font-bold leading-none">Latest</span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-text-muted tabular-nums leading-snug break-words">
                    {author ? `${author} · ` : ''}{formatStamp(su.createdAt)}
                  </p>

                  {su.remark && (
                    <p className="text-sm sm:text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words pl-2.5 border-l-2 border-primary-500/30">
                      {su.remark}
                    </p>
                  )}

                  {su.photos && su.photos.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
                        <Camera size={12} className="text-text-light" />
                        {su.photos.length} {su.photos.length === 1 ? 'photo' : 'photos'}
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-w-md">
                        {su.photos.map((photo) => {
                          const imageUrl = `${UPLOADS_BASE}${photo.url}`;
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => onPreview(imageUrl)}
                              className="group/photo relative aspect-square w-full rounded-lg border border-border/60 overflow-hidden bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                              title={photo.captureMethod === 'LIVE' ? 'Taken with the camera' : 'Added from the gallery'}
                              aria-label="Preview photo"
                            >
                              <img src={imageUrl} alt="Status photo" className="size-full object-cover" />
                              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity duration-200 flex items-center justify-center text-white">
                                <Eye size={16} strokeWidth={2.5} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
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
