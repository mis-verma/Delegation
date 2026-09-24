import { useRef, useState, useEffect, type DragEvent, type KeyboardEvent } from 'react';
import { UploadCloud, X, ImageOff, Eye, Plus } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ImageLightbox } from '../imageLightbox';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ImageUploaderProps {
  label?: string;
  hint?: string;
  files: File[];
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  accept?: string;
  multiple?: boolean;
}

function ImagePreview({ file, onRemove, onPreview }: { file: File; onRemove: () => void; onPreview: (url: string) => void }) {
  // Created inside the effect, not a useMemo — under StrictMode's dev-only mount/cleanup/remount,
  // a useMemo'd URL gets revoked by the first cleanup and never recreated (memo deps unchanged),
  // leaving the <img> pointed at a dead blob: URL that fails to decode (silently caught below by
  // the onError -> ImageOff fallback, which was masking this rather than fixing it).
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    // This IS the fix for the StrictMode bug explained above — moving creation to a lazy
    // useState initializer (the usual way to avoid a setState-in-effect lint flag) reintroduces
    // it: the initializer only runs on true mount, so StrictMode's dev-only cleanup-then-remount
    // revokes the one and only URL with nothing left to recreate it. Effect + setState is the
    // correct shape for "synchronize with an external resource keyed to a changing prop."
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  // A failed/broken <img> falls back to browser-native alt-text rendering, which doesn't reliably
  // respect this container's own sizing/overflow-hidden — swapping to a fully custom, correctly
  // contained fallback avoids that instead of fighting the browser's own broken-image layout.
  const [failed, setFailed] = useState(false);

  return (
    <div className="group relative aspect-square rounded-xl border border-border overflow-hidden bg-surface-hover shrink-0 shadow-sm transition-all duration-300 hover:shadow-md animate-in fade-in zoom-in-95">
      {url && !failed ? (
        <img
          src={url}
          alt={file.name}
          onError={() => setFailed(true)}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="size-full flex flex-col items-center justify-center gap-1.5 p-2 text-text-light">
          <ImageOff size={18} strokeWidth={1.75} />
          <span className="text-[10px] font-medium text-text-muted text-center leading-tight line-clamp-2 break-words">
            {file.name}
          </span>
        </div>
      )}

      {/* Same hover overlay (eye = preview, trash = delete) as the ticket detail's already-uploaded
          attachments — one consistent pattern everywhere an image can be viewed/removed. */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
        {url && !failed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(url);
            }}
            className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors cursor-pointer"
            aria-label={`Preview ${file.name}`}
          >
            <Eye size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1.5 rounded-full bg-danger/80 text-white hover:bg-danger transition-colors cursor-pointer"
          aria-label={`Remove ${file.name}`}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

export function ImageUploader({
  label = 'Images',
  hint = 'PNG, JPG, WebP up to 10MB',
  files,
  onAdd,
  onRemove,
  accept = 'image/*',
  multiple = true,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      onChange={(e) => {
        if (e.target.files && e.target.files.length > 0) {
          onAdd(e.target.files);
        }
        e.target.value = ''; // Reset so the same file can be uploaded again if removed
      }}
    />
  );

  return (
    <div className="flex flex-col gap-2 w-full group/uploader">
      {label && (
        <label className="block text-[11px] font-bold text-text-muted transition-colors duration-200 group-focus-within/uploader:text-primary-600 px-1">
          {label}
        </label>
      )}

      {files.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => { stop(e); setIsDragging(true); }}
          onDragLeave={(e) => { stop(e); setIsDragging(false); }}
          onDrop={(e) => {
            stop(e);
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) onAdd(e.dataTransfer.files);
          }}
          className={cn(
            'group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-all duration-300 ease-out',
            // Was focus:ring-primary-50/50 — a near-white tint that's effectively invisible on this
            // card's own white background (the same bug already caught and fixed in
            // QuickFilterStats.tsx). focus-visible, not focus, so a mouse click doesn't ring it too.
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/30 active:scale-[0.99]',
            isDragging
              ? 'border-primary-400 bg-primary-50/50 shadow-inner'
              : 'border-border bg-surface-hover hover:bg-surface-active/50 hover:border-border-hover'
          )}
        >
          {hiddenInput}

          {/* Floating Icon Tile */}
          <div
            className={cn(
              "flex items-center justify-center size-12 rounded-xl bg-surface shadow-sm ring-1 ring-border/50 transition-all duration-300",
              isDragging
                ? "text-primary-600 scale-110 shadow-md shadow-primary-600/10 ring-primary-100"
                : "text-text-light group-hover:text-primary-600 group-hover:-translate-y-1 group-hover:shadow-md"
            )}
          >
            <UploadCloud size={24} strokeWidth={2.5} />
          </div>

          <div>
            <p className="text-sm font-bold text-text-secondary transition-colors group-hover:text-text">
              Drag &amp; drop files here
            </p>
            <p className="text-xs font-medium text-text-muted mt-1.5 transition-colors">
              {hint} or{' '}
              <span className="text-primary-600 font-bold hover:text-primary-700 transition-colors">
                browse
              </span>
            </p>
          </div>
        </div>
      ) : (
        // Once at least one photo is added, the big standalone dropzone goes away — adding more
        // happens from a same-size tile living right in the thumbnail grid instead, so the whole
        // section reads as one integrated area rather than a big empty zone plus a separate list.
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">
          {files.map((file, i) => (
            <ImagePreview
              key={`${file.name}-${file.lastModified}-${i}`}
              file={file}
              onRemove={() => onRemove(i)}
              onPreview={setPreviewUrl}
            />
          ))}

          {multiple && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => { stop(e); setIsDragging(true); }}
              onDragLeave={(e) => { stop(e); setIsDragging(false); }}
              onDrop={(e) => {
                stop(e);
                setIsDragging(false);
                if (e.dataTransfer.files.length > 0) onAdd(e.dataTransfer.files);
              }}
              className={cn(
                'aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/30',
                isDragging
                  ? 'border-primary-400 bg-primary-50/50'
                  : 'border-border text-text-light hover:border-primary-400 hover:text-primary-600 hover:bg-surface-hover'
              )}
            >
              {hiddenInput}
              <Plus size={18} strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Add more</span>
            </div>
          )}
        </div>
      )}

      <ImageLightbox src={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
