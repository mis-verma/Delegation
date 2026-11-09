import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { attachmentIconFor, attachmentTypeLabel } from '../tasks/taskAttachmentDisplay';
import { cn } from '@/lib/utils';
import { ImageLightbox, ThumbImage } from '../../components';
import { isViewableKind, mediaKindFromMime, type LightboxItem } from '../../components/imageLightbox';
import { UPLOADS_BASE } from '../../lib/uploadsBase';

export interface ThumbFile {
  id: string;
  url: string;
  mimeType?: string;
  name?: string | null;
  captureMethod?: 'LIVE' | 'GALLERY';
}

interface PhotoThumbsProps {
  files: ThumbFile[];
  label?: string;
  max?: number;
  className?: string;
}

const FileIcon = ({ mimeType }: { mimeType: string }) =>
  createElement(attachmentIconFor(mimeType), { size: 18, className: 'shrink-0 text-text-muted', 'aria-hidden': true });

const isPhoto = (file: ThumbFile) => !file.mimeType || file.mimeType.startsWith('image/');
const srcOf = (file: ThumbFile) => `${UPLOADS_BASE}${file.url}`;

export const PhotoThumbs = memo(function PhotoThumbs({ files, label = 'Photo', max, className }: PhotoThumbsProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const gallery = useMemo<LightboxItem[]>(() => files.flatMap((file) => {
    const kind = mediaKindFromMime(file.mimeType);
    return isViewableKind(kind) ? [{ src: srcOf(file), kind, name: file.name }] : [];
  }), [files]);
  const shown = max ? files.slice(0, max) : files;
  const extra = files.length - shown.length;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} aria-label={`${files.length} ${files.length === 1 ? 'file' : 'files'} attached`}>
      {shown.map((file, i) => {
        const src = srcOf(file);
        const alt = file.name ?? `${label} ${i + 1}`;
        if (!isPhoto(file)) {
          const tileClass = 'flex size-16 sm:size-20 flex-col items-center justify-center gap-1 rounded-lg border border-border/70 bg-surface-hover p-1.5 text-center outline-none transition-[border-color,transform] duration-150 ease-out hover:border-primary-400 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer';
          const body = (
            <>
              <FileIcon mimeType={file.mimeType ?? ''} />
              <span className="w-full min-w-0 line-clamp-2 break-all leading-tight t-meta font-medium text-text-secondary">{file.name ?? attachmentTypeLabel(file.mimeType ?? '')}</span>
            </>
          );
          return isViewableKind(mediaKindFromMime(file.mimeType)) ? (
            <button
              key={file.id}
              type="button"
              title={alt}
              aria-label={`Open ${alt}`}
              onClick={(e) => { e.stopPropagation(); setCurrent(src); setOpen(true); }}
              className={tileClass}
            >
              {body}
            </button>
          ) : (
            <a
              key={file.id}
              href={src}
              download={file.name ?? true}
              target="_blank"
              rel="noreferrer"
              title={alt}
              aria-label={`Download ${alt}`}
              onClick={(e) => e.stopPropagation()}
              className={tileClass}
            >
              {body}
            </a>
          );
        }
        return (
          <button
            key={file.id}
            type="button"
            aria-label={`View ${alt} larger`}
            onClick={(e) => { e.stopPropagation(); setCurrent(src); setOpen(true); }}
            className="relative block size-16 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/70 bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:size-20"
          >
            <ThumbImage src={src} alt={alt} className="size-full object-cover" />
            {file.captureMethod && (
              <span className={cn('absolute inset-x-0 bottom-0 py-px text-center t-meta font-display font-semibold text-white', file.captureMethod === 'LIVE' ? 'bg-success/90' : 'bg-black/60')}>
                {file.captureMethod === 'LIVE' ? 'Live' : 'Gallery'}
              </span>
            )}
          </button>
        );
      })}
      {extra > 0 && <span className="t-meta font-display font-semibold tabular-nums text-text-muted">+{extra} more</span>}
      {open && createPortal(<ImageLightbox src={current} items={gallery} onChange={setCurrent} onClose={close} />, document.body)}
    </div>
  );
});
