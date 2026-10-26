import { memo, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageLightbox, ThumbImage } from '../../components';
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

const isPhoto = (file: ThumbFile) => !file.mimeType || file.mimeType.startsWith('image/');
const srcOf = (file: ThumbFile) => `${UPLOADS_BASE}${file.url}`;

export const PhotoThumbs = memo(function PhotoThumbs({ files, label = 'Photo', max, className }: PhotoThumbsProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const gallery = useMemo(() => files.filter(isPhoto).map(srcOf), [files]);
  const shown = max ? files.slice(0, max) : files;
  const extra = files.length - shown.length;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} aria-label={`${files.length} ${files.length === 1 ? 'file' : 'files'} attached`}>
      {shown.map((file, i) => {
        const src = srcOf(file);
        const alt = file.name ?? `${label} ${i + 1}`;
        if (!isPhoto(file)) {
          return (
            <a
              key={file.id}
              href={src}
              target="_blank"
              rel="noreferrer"
              title={alt}
              onClick={(e) => e.stopPropagation()}
              className="flex size-16 items-center justify-center rounded-lg border border-border/70 bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Film size={20} className="text-text-muted" aria-hidden="true" />
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
      {open && createPortal(<ImageLightbox src={current} images={gallery} onChange={setCurrent} onClose={close} />, document.body)}
    </div>
  );
});
