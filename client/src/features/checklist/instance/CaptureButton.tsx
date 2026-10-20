import type { LucideIcon } from 'lucide-react';
import { Loader } from '../../../components';
import { cn } from '@/lib/utils';
import { LivePhotoTrigger } from './LivePhotoTrigger';

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

export const CaptureButton = ({ icon: Icon, label, live, accept, onFiles }: CaptureButtonProps) => {
  const content = (
    <>
      <Icon size={14} aria-hidden />
      {label}
    </>
  );

  if (live) {
    return (
      <LivePhotoTrigger className={cn(BUTTON_BASE, LIVE_LOOK)} accept={accept} onFiles={onFiles}>
        {content}
      </LivePhotoTrigger>
    );
  }

  return (
    <label className={cn(BUTTON_BASE, PLAIN_LOOK)}>
      {content}
      <input
        type="file"
        accept={accept}
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
