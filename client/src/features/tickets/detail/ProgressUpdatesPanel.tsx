import { useMemo, useState } from 'react';
import { Activity, Camera, ChevronDown, Eye, History, MessageSquarePlus, Send } from 'lucide-react';
import { Button, IconChip } from '../../../components';
import { Avatar } from '../../../components/avatar';
import { CountBadge } from '../../../components/countBadge';
import { useNow } from '../../verification/useChecklistQueue';
import { FRESHNESS_LOOK, freshnessOf, lastWorkTouchOf, progressUpdatesOf, timeAgo } from '../../../lib/ticketProgress';
import { useTicketProgressMutation } from '../hook';
import { PhotoAttachments } from '../TicketStatusRemarkDialog';
import { UPLOADS_BASE } from './detailConstants';
import type { CaptureMethod, Ticket, TicketStatusUpdate } from '../../../api/ticket';

interface ProgressUpdatesPanelProps {
  ticket: Ticket;
  canPost: boolean;
  onPreview: (url: string) => void;
}

const MAX_LENGTH = 1000;
const VISIBLE_UPDATES = 3;
const QUICK_UPDATES = ['Started working on it', 'About half done', 'Waiting for a reply', 'Almost finished', 'Need some help'];

const UpdateBody = ({ update, onPreview }: { update: TicketStatusUpdate; onPreview: (url: string) => void }) => (
  <>
    {update.remark && <p className="t-card font-medium leading-relaxed text-text whitespace-pre-wrap break-words">{update.remark}</p>}
    {update.photos.length > 0 && (
      <div className="grid max-w-xs grid-cols-4 gap-1.5">
        {update.photos.map((photo) => {
          const url = `${UPLOADS_BASE}${photo.url}`;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => onPreview(url)}
              className="group/photo relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border border-border/60 bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              aria-label="Open photo"
            >
              <img src={url} alt="Progress photo" loading="lazy" className="size-full object-cover" />
              {photo.captureMethod === 'LIVE' && (
                <span className="absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded bg-black/55 text-white" title="Taken with the camera">
                  <Camera size={10} aria-hidden />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity duration-200 group-hover/photo:opacity-100" aria-hidden>
                <Eye size={16} strokeWidth={2.5} />
              </span>
            </button>
          );
        })}
      </div>
    )}
  </>
);

const UpdateMeta = ({ update, now }: { update: TicketStatusUpdate; now: number }) => {
  const name = update.changedByUser?.firstName ?? 'Someone';
  return (
    <div className="flex items-center gap-2">
      <span className="t-meta font-display font-semibold text-text">{name}</span>
      <time dateTime={update.createdAt} title={new Date(update.createdAt).toLocaleString()} className="t-meta font-display font-medium text-text-muted tabular-nums">
        {timeAgo(update.createdAt, now)}
      </time>
    </div>
  );
};

export const ProgressUpdatesPanel = ({ ticket, canPost, onPreview }: ProgressUpdatesPanelProps) => {
  const now = useNow();
  const postMut = useTicketProgressMutation(ticket.id);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [method, setMethod] = useState<CaptureMethod>('GALLERY');
  const [showEarlier, setShowEarlier] = useState(false);

  const updates = useMemo(() => progressUpdatesOf(ticket), [ticket]);
  const visibleUpdates = showEarlier ? updates : updates.slice(0, VISIBLE_UPDATES);
  const hiddenCount = updates.length - VISIBLE_UPDATES;
  const lastTouch = lastWorkTouchOf(ticket);
  const look = lastTouch ? FRESHNESS_LOOK[freshnessOf(lastTouch, now)] : null;
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !postMut.isPending;

  const send = () => {
    if (!canSend) return;
    postMut.mutate(
      { remark: trimmed, captureMethod: photos.length ? method : undefined, files: photos },
      { onSuccess: () => { setText(''); setPhotos([]); } },
    );
  };

  const addPhotos = (files: FileList | null, m: CaptureMethod) => {
    if (!files || !files.length) return;
    setPhotos((prev) => [...prev, ...Array.from(files)]);
    setMethod(m);
  };

  const addQuick = (line: string) => setText((prev) => (prev.trim() ? `${prev.trim()}. ${line}` : line));

  if (!canPost && updates.length === 0) {
    return (
      <section aria-label="Work updates" className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/30 px-3.5 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-warning to-warning/70 text-white" aria-hidden="true">
          <Activity size={18} strokeWidth={2.3} />
        </span>
        <p className="t-card font-medium leading-snug text-text-secondary">Work has started. No update has been posted yet.</p>
      </section>
    );
  }

  return (
    <section aria-label="Work updates" className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-warning/5 px-3.5 py-3 sm:px-4">
        <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
          <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-warning to-warning/70 text-white" aria-hidden="true">
            <Activity size={16} strokeWidth={2.4} />
          </span>
          Remarks and updates
          {updates.length > 0 && <CountBadge count={updates.length} max={99} label={`${updates.length} updates`} />}
        </h3>
        {lastTouch && look && (
          <IconChip
            icon={History}
            tone={look.tone}
            label={freshnessOf(lastTouch, now) === 'stale' ? `No update since ${timeAgo(lastTouch, now)}` : `Updated ${timeAgo(lastTouch, now)}`}
            className={look.chip}
            labelClassName={look.text}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 px-3.5 py-3.5 sm:px-4">
        {updates.length === 0 ? (
          <p className="t-meta font-medium text-text-muted">No update yet. Post one so the person who raised this knows work is moving.</p>
        ) : (
          <ol className="relative flex flex-col gap-3 pl-9 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-0.5 before:rounded-full before:bg-border">
            {visibleUpdates.map((u, i) => (
              <li key={u.id} className="relative">
                <span className="absolute -left-9 top-1 z-10 flex size-7 items-center justify-center rounded-full ring-4 ring-surface" aria-hidden="true">
                  <Avatar name={u.changedByUser?.firstName ?? 'Someone'} size="xs" />
                </span>
                <div className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${i === 0 ? 'border-warning/30 bg-surface' : 'border-border/60 bg-surface-hover/30'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <UpdateMeta update={u} now={now} />
                    {i === 0 && (
                      <span className="inline-flex h-5 items-center rounded-full bg-warning/10 px-2 t-meta font-display font-semibold text-warning">Latest</span>
                    )}
                  </div>
                  <UpdateBody update={u} onPreview={onPreview} />
                </div>
              </li>
            ))}
          </ol>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowEarlier((v) => !v)}
            aria-expanded={showEarlier}
            className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-200 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
          >
            <ChevronDown size={13} strokeWidth={2.5} className={`transition-transform duration-200 ${showEarlier ? 'rotate-180' : ''}`} aria-hidden="true" />
            {showEarlier ? 'Show fewer' : `Show ${hiddenCount} earlier ${hiddenCount === 1 ? 'update' : 'updates'}`}
          </button>
        )}
      </div>

      {canPost && (
        <div className="flex flex-col gap-2 border-t border-border/60 bg-surface-hover/30 px-3.5 py-3.5 sm:px-4">
          <label htmlFor={`progress-${ticket.id}`} className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
            <MessageSquarePlus size={14} aria-hidden="true" />
            Add an update
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick updates">
            {QUICK_UPDATES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => addQuick(q)}
                className="h-8 cursor-pointer rounded-full border border-border/60 bg-surface px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:h-10"
              >
                {q}
              </button>
            ))}
          </div>
          <textarea
            id={`progress-${ticket.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); }}
            rows={3}
            maxLength={MAX_LENGTH}
            placeholder="e.g. Replaced the cable. Testing it with the printer now."
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base text-text outline-none transition-colors duration-150 focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
          />
          <PhotoAttachments photos={photos} onAddPhotos={addPhotos} onRemovePhoto={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} />
          <div className="flex items-center justify-between gap-3">
            <span className="t-meta font-medium text-text-muted tabular-nums">{trimmed.length} of {MAX_LENGTH}</span>
            <Button variant="primary" onClick={send} isLoading={postMut.isPending} disabled={!canSend} className="h-11 gap-1.5 font-display font-semibold sm:h-10">
              <Send size={15} aria-hidden="true" />
              Post update
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
