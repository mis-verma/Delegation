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

export const UploadingHint = ({ progress }: { progress?: number | null }) => {
  const percent = progress == null ? null : Math.min(100, Math.round(progress * 100));
  return (
    <span role="status" className="inline-flex items-center gap-2 t-meta text-text-muted">
      <Loader size="sm" variant="slate" />
      <span className="tabular-nums">{percent === null || percent === 0 ? 'Uploading…' : percent >= 100 ? 'Saving…' : `Uploading ${percent}%`}</span>
      {percent !== null && (
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
          <span className="block h-full rounded-full bg-primary-500 transition-[width] duration-150" style={{ width: `${percent}%` }} />
        </span>
      )}
    </span>
  );
};
