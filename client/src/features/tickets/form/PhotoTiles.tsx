import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { formatFileSize } from '../../tasks/taskAttachmentDisplay';

interface PhotoTilesProps {
  files: File[];
  onRemove: (index: number) => void;
}

/** Photos picked but not uploaded yet, as square thumbnails that wrap in a grid. Tickets only take
 *  images, so every file gets a real preview, and a long file name can never push the row wide. */
export const PhotoTiles = ({ files, onRemove }: PhotoTilesProps) => {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!files.length) return null;

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4" aria-label="Photos to attach">
      {files.map((f, i) => (
        <li
          key={`${f.name}-${f.size}-${i}`}
          title={`${f.name} (${formatFileSize(f.size)})`}
          className="relative aspect-square min-w-0 overflow-hidden rounded-lg border border-border/60 bg-surface-hover"
        >
          <img src={urls[i]} alt={f.name} className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${f.name}`}
            className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-text/70 text-surface outline-none transition-colors hover:bg-danger hover:text-white focus-visible:ring-2 focus-visible:ring-primary-500/60 pointer-coarse:size-9 cursor-pointer"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </li>
      ))}
    </ul>
  );
};
