import { History, Camera, User, ArrowRight, Eye } from 'lucide-react';
import { SECTION_HEADER, UPLOADS_BASE } from './detailConstants';
import { StatusChip, getStatusChipLabel, type StatusChipStatus } from '../../../components/statusChip';
import type { TicketStatusUpdate } from '../../../api/ticket';

interface TicketStatusHistoryProps {
  statusUpdates: TicketStatusUpdate[];
  onPreview: (url: string) => void;
}

const formatDateTime = (dateString: string) => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return dateString;
  }
};

export const TicketStatusHistory = ({ statusUpdates, onPreview }: TicketStatusHistoryProps) => {
  if (!statusUpdates || statusUpdates.length === 0) return null;

  return (
    <div className="flex flex-col gap-5 font-sans">
      <h3 className={`${SECTION_HEADER} flex items-center gap-2 text-sm font-semibold text-text`}>
        <History size={16} className="text-primary-600 dark:text-primary-400" strokeWidth={2.5} />
        <span>Status History</span>
      </h3>

      {/* Vertical Timeline Wrapper */}
      <div className="relative pl-5 space-y-5 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
        {statusUpdates.map((su, index) => {
          const statusChipStatus = su.toStatus.toLowerCase() as StatusChipStatus;
          const userDisplayName = su.changedBy?.firstName || 'Unknown';
          const isLatest = index === 0;

          return (
            <div key={su.id} className="relative group">
              <span className={`absolute -left-[21px] top-4 h-3 w-3 rounded-full ring-4 ring-surface/50 transition-colors ${
                isLatest ? 'bg-primary-600 shadow-[0_0_8px_color-mix(in_srgb,var(--color-primary-600)_40%,transparent)]' : 'bg-border-hover'
              }`} />

              <div className="flex flex-col gap-3 p-4 rounded-xl border border-border bg-surface hover:border-border-hover transition-all duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-bold text-text flex items-center gap-1.5">
                      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-surface-hover">
                        <User size={12} className="text-text-muted" />
                      </div>
                      {userDisplayName}
                    </span>

                    <span className="text-text-muted flex items-center gap-1 text-[11px] font-medium tracking-wide">
                      <ArrowRight size={12} className="text-text-light" />
                      <span>moved to</span>
                    </span>

                    <StatusChip status={statusChipStatus} label={getStatusChipLabel(statusChipStatus)} />
                  </div>

                  <span className="text-[11px] text-text-muted font-bold tracking-wide">
                    {formatDateTime(su.createdAt)}
                  </span>
                </div>

                {su.remark && (
                  <div className="bg-surface-hover rounded-lg p-3 border border-border mt-1">
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words italic">
                      "{su.remark}"
                    </p>
                  </div>
                )}

                {su.photos && su.photos.length > 0 && (
                  <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-border">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted tracking-wide">
                      <Camera size={14} className="text-text-light" />
                      <span>Evidence ({su.photos.length})</span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {su.photos.map((photo) => {
                        const imageUrl = `${UPLOADS_BASE}${photo.url}`;
                        return (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => onPreview(imageUrl)}
                            className="group/photo relative h-16 w-16 rounded-xl border border-border overflow-hidden bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 focus:ring-offset-background transition-all cursor-pointer shadow-sm hover:shadow-md"
                            title={
                              photo.captureMethod === 'LIVE'
                                ? 'Captured live camera'
                                : 'Uploaded from gallery'
                            }
                            aria-label="Preview evidence photo"
                          >
                            <img
                              src={imageUrl}
                              alt="Evidence attachment"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover/photo:scale-110"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/photo:opacity-100 transition-opacity duration-200 flex items-center justify-center text-white backdrop-blur-[2px]">
                              <Eye size={18} strokeWidth={2.5} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};