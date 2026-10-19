import { useRef } from 'react';
import { Paperclip, Camera } from 'lucide-react';
import { ACCEPTED_ATTACHMENT_TYPES } from './taskAttachmentDisplay';

const BTN_CLASS =
  'inline-flex items-center gap-1.5 h-8 pointer-coarse:h-11 px-2.5 pointer-coarse:px-3.5 rounded-lg t-meta font-display font-semibold text-text-secondary hover:text-text hover:bg-surface-hover transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 [-webkit-tap-highlight-color:transparent]';

interface AttachFilesToolbarProps {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  bordered?: boolean;
}

export const AttachFilesToolbar = ({ onFiles, disabled, bordered = false }: AttachFilesToolbarProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const btnClass = `${BTN_CLASS} border ${bordered ? 'border-border hover:border-border-hover' : 'border-transparent'}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_TYPES} multiple className="hidden" onChange={handleChange} />
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />

      <button type="button" disabled={disabled} className={btnClass} onClick={() => fileInputRef.current?.click()}>
        <Paperclip size={15} aria-hidden />
        File
      </button>
      <button type="button" disabled={disabled} className={btnClass} onClick={() => photoInputRef.current?.click()}>
        <Camera size={15} aria-hidden />
        Photo
      </button>
    </div>
  );
};
