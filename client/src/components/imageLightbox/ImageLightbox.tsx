import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  src: string | null;
  onClose: () => void;
}

// Shared full-screen preview — used by both the ticket detail's already-uploaded attachments and
// ImageUploader's local file previews, so "eye to preview" behaves identically everywhere images
// can be viewed in the app.
export const ImageLightbox = ({ src, onClose }: ImageLightboxProps) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!src) return;
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      {/* stopPropagation here — without it, a click anywhere on the image itself bubbles up to
          the backdrop's onClose, so just looking closer at the photo would dismiss the viewer. */}
      <div
        className="relative max-w-2xl max-h-[85vh] rounded-xl overflow-hidden shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close image preview"
          className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X size={16} />
        </button>
        <img src={src} alt="Enlarged preview" className="object-contain max-h-[80vh] w-auto" />
      </div>
    </div>
  );
};
