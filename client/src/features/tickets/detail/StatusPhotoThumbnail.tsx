import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export const StatusPhotoThumbnail = ({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: (index: number) => void;
}) => {
  // Created inside the effect, not a useMemo — under StrictMode's dev-only mount/cleanup/remount,
  // a useMemo'd URL gets revoked by the first cleanup and never recreated (memo deps unchanged),
  // leaving the <img> pointed at a dead blob: URL that decodes as a 0x0 broken image. Creating it
  // per effect run means the remount gets its own fresh URL instead of the revoked one.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    // Same StrictMode reasoning as the comment above rules out a lazy useState initializer here
    // too: it only runs on true mount, so the dev-only cleanup-then-remount would revoke the one
    // and only URL with nothing left to recreate it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Fills its grid cell (the caller lays thumbnails out in a 3 / 4 column grid) and stays square.
  // The remove button is always visible on touch screens, where there is no hover to reveal it,
  // and only fades in on hover for a mouse. `after:-inset-1.5` stretches its tap area to 44px.
  return (
    <div className="group relative aspect-square w-full rounded-xl border border-border bg-surface-hover overflow-hidden transition-colors hover:border-border-hover">
      {previewUrl && (
        <img
          src={previewUrl}
          alt={file.name}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      )}

      {/* Overlay gradient for better button visibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-200 pointer-events-none" />

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute top-1 right-1 flex items-center justify-center size-8 rounded-full bg-surface text-text-muted hover:text-danger border border-border/50 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-all duration-200 cursor-pointer outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger after:absolute after:-inset-1.5"
        aria-label={`Remove ${file.name}`}
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
};
