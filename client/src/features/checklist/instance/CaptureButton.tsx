import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader } from '../../../components';
import { cn } from '@/lib/utils';
import { LiveCameraDialog } from './LiveCameraDialog';

interface CaptureButtonProps {
  icon: LucideIcon;
  label: string;
  live: boolean;
  accept: string;
  onFiles: (files: FileList | null) => void;
}

const BUTTON_BASE = cn(
  'inline-flex items-center justify-center gap-1.5 h-8 pointer-coarse:h-11 px-3 rounded-md border t-meta font-medium whitespace-nowrap',
  'cursor-pointer select-none transition-colors duration-200 ease-in-out active:scale-[0.98] [-webkit-tap-highlight-color:transparent]',
  'focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-background',
);

const LIVE_LOOK = 'border-primary-500/50 text-primary-700 dark:text-primary-300 hover:border-primary-500 hover:bg-primary-500/10';
const PLAIN_LOOK = 'border-border text-text-secondary hover:border-border-hover hover:bg-surface-hover';

const needsDesktopCamera = (live: boolean, accept: string) =>
  live
  && accept.startsWith('image')
  && typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && !window.matchMedia('(pointer: coarse)').matches;

const toFileList = (file: File): FileList => {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  return transfer.files;
};

export const CaptureButton = ({ icon: Icon, label, live, accept, onFiles }: CaptureButtonProps) => {
  const [cameraOpen, setCameraOpen] = useState(false);

  if (needsDesktopCamera(live, accept)) {
    return (
      <>
        <button type="button" onClick={() => setCameraOpen(true)} className={cn(BUTTON_BASE, LIVE_LOOK, 'outline-none focus-visible:ring-2 focus-visible:ring-primary-500')}>
          <Icon size={14} aria-hidden />
          {label}
        </button>
        {cameraOpen && <LiveCameraDialog open onClose={() => setCameraOpen(false)} onCapture={(file) => onFiles(toFileList(file))} />}
      </>
    );
  }

  return (
    <label className={cn(BUTTON_BASE, live ? LIVE_LOOK : PLAIN_LOOK)}>
      <Icon size={14} aria-hidden />
      {label}
      <input
        type="file"
        accept={accept}
        capture={live ? 'environment' : undefined}
        multiple
        className="sr-only"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
      />
    </label>
  );
};

export const UploadingHint = () => (
  <span role="status" className="inline-flex items-center gap-1.5 t-meta text-text-muted">
    <Loader size="sm" variant="slate" />
    Uploading…
  </span>
);
