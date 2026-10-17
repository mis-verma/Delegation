import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { attachmentIconFor, formatFileSize, isImageAttachment } from './taskAttachmentDisplay';

interface StagedFileChipsProps {
  files: File[];
  onRemove: (index: number) => void;
}

const StagedImage = ({ file }: { file: File }) => {
  const [preview, setPreview] = useState<{ file: File; src: string } | null>(null);
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPreview({ file, src: reader.result });
    };
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  if (!preview || preview.file !== file) return <div className="size-full animate-pulse bg-surface-hover" aria-hidden="true" />;
  return <img src={preview.src} alt={file.name} className="size-full object-cover" />;
};

export const StagedFileChips = ({ files, onRemove }: StagedFileChipsProps) => {
  if (!files.length) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Files to upload">
      {files.map((f, i) => {
        const Icon = attachmentIconFor(f.type);
        return (
          <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative size-18 sm:size-20 shrink-0 rounded-lg border border-border bg-surface-hover overflow-hidden">
            {isImageAttachment(f.type) ? (
              <StagedImage file={f} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-0.5 p-1.5 text-center">
                <Icon size={20} className="text-text-light shrink-0" aria-hidden="true" />
                <span className="w-full min-w-0 truncate t-meta font-medium text-text" title={f.name}>{f.name}</span>
                <span className="hidden sm:block t-meta text-text-light">{formatFileSize(f.size)}</span>
              </div>
            )}
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
