import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useCloseOnBack } from '../../lib/useCloseOnBack';

interface ImageLightboxProps {
  src: string | null;
  onClose: () => void;
}

/** Pull the photo down this far (px) to close. */
const SWIPE_CLOSE_PX = 96;

// Shared full-screen preview, used by the ticket and delegation detail sheets' attachments and
// ImageUploader's local previews, so "tap to preview" behaves the same everywhere.
//
// Built on Radix Dialog (its own portal on document.body, z-[90], above dialogs at z-[70] and
// popovers at z-[80]) so it stacks cleanly on top of the sheet it was opened from: Escape, the
// focus trap and outside taps all go to this layer first and never close the sheet underneath.
// Closes on the X, a tap on the dark backdrop, Escape, the phone back gesture, or pulling the photo
// down. No fade or shadow; it just appears.
export const ImageLightbox = ({ src, onClose }: ImageLightboxProps) => {
  const open = !!src;
  useCloseOnBack(open, onClose);

  const imageRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ y: number; dy: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || e.pointerType === 'mouse') return;
    swipe.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (imageRef.current) imageRef.current.style.transition = 'none';
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || !imageRef.current) return;
    s.dy = Math.max(0, e.clientY - s.y);
    imageRef.current.style.transform = `translateY(${s.dy}px)`;
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!s || !imageRef.current) return;
    if (s.dy > SWIPE_CLOSE_PX) {
      onClose();
      return;
    }
    imageRef.current.style.transition = 'transform 200ms ease-out';
    imageRef.current.style.transform = '';
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/85" />
        <DialogPrimitive.Content
          aria-label="Image preview"
          aria-describedby={undefined}
          // The content fills the screen so the photo can be centred; a tap on the dark area around
          // the photo (the content itself, not the image) closes it.
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Image preview</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close image preview"
            style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
            className="fixed right-3 z-10 flex items-center justify-center size-11 rounded-full bg-black/60 text-white cursor-pointer transition-colors duration-150 ease-out hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X size={20} />
          </DialogPrimitive.Close>
          {src && (
            <div
              ref={imageRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              className="relative max-w-2xl max-h-[85dvh] rounded-xl overflow-hidden border border-white/10 [touch-action:pinch-zoom]"
            >
              <img src={src} alt="Enlarged preview" draggable={false} className="block object-contain max-h-[85dvh] w-auto select-none" />
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
