import { createElement, type ReactNode } from 'react';
import { Camera, Download, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThumbImage } from '../thumbImage';
import { mediaKindFromMime } from '../imageLightbox/mediaKind';
import { attachmentIconFor, attachmentTypeLabel, formatFileSize } from '../../features/tasks/taskAttachmentDisplay';

export interface AttachmentGridItem {
  id: string;
  url: string;
  mimeType: string;
  name?: string | null;
  sizeBytes?: number | null;
  live?: boolean;
}

interface AttachmentGridProps {
  items: AttachmentGridItem[];
  onOpen: (item: AttachmentGridItem) => void;
  canRemove?: (item: AttachmentGridItem) => boolean;
  onRemove?: (item: AttachmentGridItem) => void;
  removing?: boolean;
  trailing?: ReactNode;
  photoNoun?: string;
}

export const ATTACHMENT_GRID_CLASS = 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2';
export const ATTACHMENT_TILE_CLASS = 'aspect-square rounded-lg';

const TILE_REMOVE_BUTTON =
  "absolute top-1 right-1 flex items-center justify-center size-7 rounded-full bg-black/60 text-white cursor-pointer outline-none transition-[opacity,background-color] duration-150 ease-out hover:bg-danger opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50 after:absolute after:-inset-2 after:content-['']";

const ROW_BUTTON =
  'relative flex items-center justify-center size-8 pointer-coarse:size-11 shrink-0 rounded-full text-text-muted outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary-500/40';

const FileIcon = ({ mimeType }: { mimeType: string }) =>
  createElement(attachmentIconFor(mimeType), { size: 18, className: 'shrink-0 text-text-light', 'aria-hidden': true });

export const AttachmentGrid = ({ items, onOpen, canRemove, onRemove, removing = false, trailing, photoNoun = 'photo' }: AttachmentGridProps) => {
  const photos = items.filter((i) => mediaKindFromMime(i.mimeType) === 'image');
  const files = items.filter((i) => mediaKindFromMime(i.mimeType) !== 'image');
  const removable = (item: AttachmentGridItem) => !!onRemove && (canRemove ? canRemove(item) : true);

  return (
    <div className="flex flex-col gap-2">
      {(photos.length > 0 || trailing) && (
        <div className={ATTACHMENT_GRID_CLASS}>
          {photos.map((item, i) => {
            const name = item.name ?? `${photoNoun.charAt(0).toUpperCase()}${photoNoun.slice(1)} ${i + 1}`;
            return (
              <div key={item.id} className="group relative aspect-square">
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  aria-label={`Open ${photoNoun} ${name}`}
                  className="size-full overflow-hidden rounded-lg border border-border/60 bg-surface-hover cursor-zoom-in outline-none transition-[border-color,transform] duration-150 ease-out hover:border-primary-400 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <ThumbImage src={item.url} alt={name} className="size-full object-cover" />
                </button>
                {item.live && (
                  <span className="pointer-events-none absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-md bg-black/55 text-white" title="Taken with the camera">
                    <Camera size={11} aria-hidden />
                    <span className="sr-only">Taken with the camera</span>
                  </span>
                )}
                {removable(item) && (
                  <button
                    type="button"
                    onClick={() => onRemove?.(item)}
                    disabled={removing}
                    aria-label={`Remove ${photoNoun} ${name}`}
                    className={TILE_REMOVE_BUTTON}
                  >
                    <X size={13} strokeWidth={2.75} aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
          {trailing}
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((item) => {
            const kind = mediaKindFromMime(item.mimeType);
            const viewable = kind === 'video' || kind === 'pdf';
            const name = item.name ?? 'Untitled file';
            const meta = [attachmentTypeLabel(item.mimeType), item.sizeBytes != null ? formatFileSize(item.sizeBytes) : null].filter(Boolean).join(', ');
            return (
              <li key={item.id} className="relative flex items-center gap-2 rounded-lg border border-border/70 bg-surface-hover/40 px-3 py-2">
                <FileIcon mimeType={item.mimeType} />
                {viewable ? (
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
                    aria-label={`Open ${name}`}
                  >
                    <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug break-all transition-colors duration-150 hover:text-primary-700 dark:hover:text-primary-300">{name}</span>
                    <span className="t-meta text-text-muted tabular-nums">{meta}</span>
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug break-all" title={name}>{name}</span>
                    <span className="t-meta text-text-muted tabular-nums">{meta}</span>
                  </div>
                )}
                {viewable && (
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    aria-label={kind === 'video' ? `Play ${name}` : `View ${name}`}
                    title={kind === 'video' ? 'Play' : 'View'}
                    className={cn(ROW_BUTTON, 'hover:text-primary-700 dark:hover:text-primary-300 hover:bg-surface-hover cursor-pointer')}
                  >
                    <Play size={15} aria-hidden />
                  </button>
                )}
                <a
                  href={item.url}
                  download={item.name ?? true}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Download ${name}`}
                  title="Download"
                  className={cn(ROW_BUTTON, 'hover:text-primary-700 dark:hover:text-primary-300 hover:bg-surface-hover')}
                >
                  <Download size={15} aria-hidden />
                </a>
                {removable(item) && (
                  <button
                    type="button"
                    onClick={() => onRemove?.(item)}
                    disabled={removing}
                    aria-label={`Remove ${name}`}
                    className={cn(ROW_BUTTON, 'border border-border/50 bg-surface hover:text-danger cursor-pointer disabled:opacity-50')}
                  >
                    <X size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
