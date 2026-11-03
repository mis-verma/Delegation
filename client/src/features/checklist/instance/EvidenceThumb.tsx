import { memo, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ImageLightbox, ThumbImage } from '../../../components';
import { UPLOADS_BASE } from '../../../lib/uploadsBase';
import { useAuth } from '../../../context/AuthContext';
import { formatTimeOnly } from '../checklistDisplay';
import { REVIEW_REASONS, failureLabel, failureTitle, isFailedPhoto, qualityFlagsOf, qualityLabel, qualityTitle } from '../photoQuality';
import { usePhotoReviewMutation } from '../usePhotoReviewMutation';
import { usePhotoReview, type PhotoReviewState } from './photoReviewContext';
import type { CaptureMethod } from '../../../api/ticket';
import type { PhotoReviewReason, PhotoReviewStatus } from '../../../api/checklistInstances';

export interface EvidenceImage {
  id:               string;
  url:              string;
  originalFilename: string | null;
  mimeType:         string;
  captureMethod:    CaptureMethod;
  createdAt:        string;
  reusedFromEarlier?: boolean;
  takenBeforeRun?:    boolean;
  qualityFlags?:      string | null;
  reviewStatus?:      PhotoReviewStatus;
  reviewReason?:      string | null;
}

interface EvidenceThumbProps {
  image:        EvidenceImage;
  fallbackAlt?: string;
  onDelete?:    (imageId: string) => void;
  deleting?:    boolean;
  siblings?:    EvidenceImage[];
  large?:       boolean;
}

const REVIEW_BUTTON =
  'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-8';

const PhotoReviewActions = ({ image, state }: { image: EvidenceImage; state: PhotoReviewState }) => {
  const review = usePhotoReviewMutation(state);
  const [choosing, setChoosing] = useState(false);
  const rejected = image.reviewStatus === 'REJECTED';
  const failed = isFailedPhoto(image);

  const reject = (reason: PhotoReviewReason) => {
    review.mutate({ id: image.id, action: 'REJECT', reason }, { onSuccess: () => setChoosing(false) });
  };

  if (choosing) {
    return (
      <div className="flex max-w-56 flex-col gap-1" role="group" aria-label="Why is this photo rejected?">
        <span className="t-meta font-display font-semibold text-text-secondary">Why?</span>
        <div className="flex flex-wrap gap-1">
          {REVIEW_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              disabled={review.isPending}
              onClick={() => reject(reason.value)}
              className={`${REVIEW_BUTTON} border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50`}
            >
              {reason.label}
            </button>
          ))}
          <button type="button" onClick={() => setChoosing(false)} className={`${REVIEW_BUTTON} border-border text-text-secondary hover:border-border-hover`}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {!rejected && (
        <button type="button" onClick={() => setChoosing(true)} className={`${REVIEW_BUTTON} border-danger/40 text-danger hover:bg-danger/10`}>
          Reject
        </button>
      )}
      {failed && (
        <button
          type="button"
          disabled={review.isPending}
          onClick={() => review.mutate({ id: image.id, action: 'ACCEPT' })}
          className={`${REVIEW_BUTTON} border-border text-text-secondary hover:border-border-hover disabled:opacity-50`}
        >
          Accept anyway
        </button>
      )}
    </div>
  );
};

export const EvidenceThumb = memo(function EvidenceThumb({ image, fallbackAlt = 'Evidence', onDelete, deleting, siblings, large = false }: EvidenceThumbProps) {
  const src = `${UPLOADS_BASE}${image.url}`;
  const { user } = useAuth();
  const review = usePhotoReview();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(src);
  const closeLightbox = useCallback(() => setOpen(false), []);
  const gallery = useMemo(
    () => (siblings ?? [image]).filter((i) => !i.mimeType.startsWith('video/')).map((i) => `${UPLOADS_BASE}${i.url}`),
    [siblings, image],
  );
  const isVideo = image.mimeType.startsWith('video/');
  const alt = image.originalFilename ?? fallbackAlt;
  const weak = isVideo ? [] : qualityFlagsOf(image);
  const failed = !isVideo && isFailedPhoto(image);
  const canDeleteFailed = user?.role === 'ADMIN' || user?.role === 'PC';
  const showDelete = !!onDelete && (!failed || canDeleteFailed);

  return (
    <div className="flex flex-col items-start gap-1.5">
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
            onClick={() => { setCurrent(src); setOpen(true); }}
            aria-label={`View ${alt} larger`}
            className="block rounded-lg outline-none cursor-zoom-in focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ThumbImage
              src={src}
              alt={alt}
              width={large ? 320 : 160}
              className={`object-cover rounded-lg border bg-surface-hover ${failed ? 'border-danger ring-2 ring-danger/40' : 'border-border'} ${large ? 'size-24 sm:size-28' : 'size-16'}`}
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
        {(image.reusedFromEarlier || image.takenBeforeRun) && (
          <span className="pointer-events-none absolute -top-1 -right-1 px-1.5 rounded-full bg-danger t-meta font-display font-semibold text-white" title={image.reusedFromEarlier ? 'This photo looks the same as one uploaded earlier for another question' : 'This photo was taken before this checklist opened'}>
            {image.reusedFromEarlier ? 'Reused' : 'Old'}
          </span>
        )}
        {failed ? (
          <span className="pointer-events-none absolute bottom-3 left-1 px-1.5 rounded-full bg-danger t-meta font-display font-semibold text-white" title={failureTitle(image)}>
            {failureLabel(image)}
          </span>
        ) : weak.length > 0 && (
          <span className="pointer-events-none absolute bottom-3 left-1 px-1.5 rounded-full bg-warning t-meta font-display font-semibold text-white" title={qualityTitle(weak[0])}>
            {qualityLabel(weak[0])}
          </span>
        )}
        <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-full bg-black/70 t-meta font-display font-medium text-white whitespace-nowrap tabular-nums">
          {formatTimeOnly(image.createdAt)}
        </span>

        {showDelete && (
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

        {open && !isVideo && createPortal(<ImageLightbox src={current} images={gallery} onChange={setCurrent} onClose={closeLightbox} />, document.body)}
      </div>

      {review && !isVideo && <PhotoReviewActions image={image} state={review} />}
    </div>
  );
});
