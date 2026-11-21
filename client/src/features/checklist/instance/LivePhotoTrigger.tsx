import { useRef, useState, type ReactNode } from 'react';
import { SwitchCamera } from 'lucide-react';
import { LiveCameraDialog } from './LiveCameraDialog';
import { canUseInAppCamera, needsDesktopCamera, toFileList, type CameraFacing } from './cameraSupport';
import type { CaptureMethod } from '../../../api/ticket';

interface LivePhotoTriggerProps {
  className: string;
  onFiles: (files: FileList | null, method: CaptureMethod) => void;
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
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const inputRef = useRef<HTMLInputElement>(null);
  const flipFacing = () => setFacing((f) => (f === 'environment' ? 'user' : 'environment'));

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
          onChange={(e) => { onFiles(e.target.files, 'GALLERY'); e.target.value = ''; }}
        />
        {open && (
          <LiveCameraDialog
            open
            multi
            limit={limit}
            onClose={() => setOpen(false)}
            onDone={(files) => onFiles(toFileList(files), 'LIVE')}
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
        {open && <LiveCameraDialog open onClose={() => setOpen(false)} onCapture={(file) => onFiles(toFileList(file), 'LIVE')} />}
      </>
    );
  }

  return (
    <span className="relative inline-flex">
      <label className={className} aria-disabled={disabled || undefined}>
        {children}
        <input
          type="file"
          accept={accept}
          capture={facing}
          multiple={multiple}
          disabled={disabled}
          aria-label={ariaLabel}
          className="sr-only"
          onChange={(e) => { onFiles(e.target.files, 'LIVE'); e.target.value = ''; }}
        />
      </label>
      {canUseInAppCamera(accept) && (
        <button
          type="button"
          onClick={flipFacing}
          disabled={disabled}
          aria-label={facing === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
          title={facing === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
          className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-text-muted outline-none transition-colors duration-150 hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:opacity-50"
        >
          <SwitchCamera size={12} aria-hidden />
        </button>
      )}
    </span>
  );
};
