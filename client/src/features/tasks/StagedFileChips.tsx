import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { attachmentIconFor, formatFileSize, isImageAttachment } from './taskAttachmentDisplay';

interface StagedFileChipsProps {
  files: File[];
  onRemove: (index: number) => void;
}

// Preview chips for files picked but not yet uploaded — shared by the comment composer and the
// Create-delegation form's own attach toolbar, both of which stage files locally until the actual
// submit (there's no task/comment id to upload against until then).
export const StagedFileChips = ({ files, onRemove }: StagedFileChipsProps) => {
  const previewUrls = useMemo(
    () => files.map((f) => (isImageAttachment(f.type) ? URL.createObjectURL(f) : '')),
    [files]
  );
  useEffect(() => () => previewUrls.forEach((u) => u && URL.revokeObjectURL(u)), [previewUrls]);

  if (!files.length) return null;

  return (
    // Three square tiles a row on a phone, so nothing ever runs off a 320px screen. Photos show as
    // a thumbnail; anything else as a file tile with its (cut) name and size.
    <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2" aria-label="Files to upload">
      {files.map((f, i) => {
        const Icon = attachmentIconFor(f.type);
        return (
          <li key={i} className="relative aspect-square min-w-0 rounded-lg border border-border bg-surface-hover overflow-hidden">
            {previewUrls[i] ? (
              <img src={previewUrls[i]} alt={f.name} className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                <Icon size={20} className="text-text-light shrink-0" aria-hidden="true" />
                <span className="w-full min-w-0 truncate t-meta font-medium text-text" title={f.name}>{f.name}</span>
                <span className="t-meta text-text-light">{formatFileSize(f.size)}</span>
              </div>
            )}
            {/* 24px circle on screen, 44px to a finger (the ::after pad). */}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${f.name}`}
              className="absolute top-1 right-1 flex items-center justify-center size-6 rounded-full bg-black/60 text-white cursor-pointer transition-colors duration-150 ease-out hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 after:absolute after:-inset-2.5 after:content-['']"
            >
              <X size={14} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
