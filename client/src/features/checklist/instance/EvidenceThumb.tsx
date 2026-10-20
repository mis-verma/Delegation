import { memo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ImageLightbox } from '../../../components';
import { UPLOADS_BASE } from '../../../lib/uploadsBase';
import { formatTimeOnly } from '../checklistDisplay';
import type { CaptureMethod } from '../../../api/ticket';

export interface EvidenceImage {
  id:               string;
  url:              string;
  originalFilename: string | null;
  mimeType:         string;
  captureMethod:    CaptureMethod;
  createdAt:        string;
}

interface EvidenceThumbProps {
  image:        EvidenceImage;
  fallbackAlt?: string;
  onDelete?:    (imageId: string) => void;
  deleting?:    boolean;
}

export const EvidenceThumb = memo(function EvidenceThumb({ image, fallbackAlt = 'Evidence', onDelete, deleting }: EvidenceThumbProps) {
  const [open, setOpen] = useState(false);
  const closeLightbox = useCallback(() => setOpen(false), []);
  const src = `${UPLOADS_BASE}${image.url}`;
  const isVideo = image.mimeType.startsWith('video/');
  const alt = image.originalFilename ?? fallbackAlt;

  return (
    <div className="relative">
      {isVideo ? (
        <video
          src={`${src}#t=0.1`}
          preload="metadata"
          controls
          muted
          playsInline
          aria-label={alt}
          className="h-24 w-40 object-cover rounded-lg border border-border bg-surface-hover"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View ${alt} larger`}
          className="block rounded-lg outline-none cursor-zoom-in focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="size-16 object-cover rounded-lg border border-border bg-surface-hover"
          />
        </button>
      )}

      <span
        className={`pointer-events-none absolute -top-1 -left-1 px-1 rounded-full t-meta font-display font-semibold text-white ${
          image.captureMethod === 'LIVE' ? 'bg-success' : 'bg-text-muted'
        }`}
      >
        {image.captureMethod === 'LIVE' ? 'Live' : 'Gallery'}
      </span>
      <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-full bg-black/70 t-meta font-display font-medium text-white whitespace-nowrap tabular-nums">
        {formatTimeOnly(image.createdAt)}
      </span>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(image.id)}
          disabled={deleting}
          aria-label={`Delete ${alt}`}
          className="absolute -top-2 -right-2 size-6 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted hover:text-danger hover:border-danger/40 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-danger/40 after:absolute after:-inset-2.5 sm:after:-inset-1.5 after:content-['']"
        >
          <X size={11} aria-hidden />
        </button>
      )}

      {open && !isVideo && createPortal(<ImageLightbox src={src} onClose={closeLightbox} />, document.body)}
    </div>
  );
});
