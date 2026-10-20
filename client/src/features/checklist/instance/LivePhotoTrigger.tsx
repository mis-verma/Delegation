import { useState, type ReactNode } from 'react';
import { LiveCameraDialog } from './LiveCameraDialog';
import { needsDesktopCamera, toFileList } from './cameraSupport';

interface LivePhotoTriggerProps {
  className: string;
  onFiles: (files: FileList | null) => void;
  children: ReactNode;
  accept?: string;
  multiple?: boolean;
}

export const LivePhotoTrigger = ({ className, onFiles, children, accept = 'image/*', multiple = true }: LivePhotoTriggerProps) => {
  const [open, setOpen] = useState(false);

  if (needsDesktopCamera(true, accept)) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {children}
        </button>
        {open && <LiveCameraDialog open onClose={() => setOpen(false)} onCapture={(file) => onFiles(toFileList(file))} />}
      </>
    );
  }

  return (
    <label className={className}>
      {children}
      <input
        type="file"
        accept={accept}
        capture="environment"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
      />
    </label>
  );
};
