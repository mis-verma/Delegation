import { useRef, useState, type ReactNode } from 'react';
import { LiveCameraDialog } from './LiveCameraDialog';
import { canUseInAppCamera, needsDesktopCamera, toFileList } from './cameraSupport';

interface LivePhotoTriggerProps {
  className: string;
  onFiles: (files: FileList | null) => void;
  children: ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  burst?: boolean;
  limit?: number;
}

export const LivePhotoTrigger = ({ className, onFiles, children, accept = 'image/*', multiple = true, disabled = false, ariaLabel, burst = false, limit }: LivePhotoTriggerProps) => {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (burst && canUseInAppCamera(accept)) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={className} disabled={disabled} aria-label={ariaLabel}>
          {children}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          capture="environment"
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        />
        {open && (
          <LiveCameraDialog
            open
            multi
            limit={limit}
            onClose={() => setOpen(false)}
            onDone={(files) => onFiles(toFileList(files))}
            onFallback={() => { setOpen(false); inputRef.current?.click(); }}
          />
        )}
      </>
    );
  }

  if (needsDesktopCamera(true, accept)) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={className} disabled={disabled} aria-label={ariaLabel}>
          {children}
        </button>
        {open && <LiveCameraDialog open onClose={() => setOpen(false)} onCapture={(file) => onFiles(toFileList(file))} />}
      </>
    );
  }

  return (
    <label className={className} aria-disabled={disabled || undefined}>
      {children}
      <input
        type="file"
        accept={accept}
        capture="environment"
        multiple={multiple}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
      />
    </label>
  );
};
