import type { LucideIcon } from 'lucide-react';
import { Loader } from '../../../components';
import { cn } from '@/lib/utils';

interface CaptureButtonProps {
  icon: LucideIcon;
  label: string;
  live: boolean;
  accept: string;
  onFiles: (files: FileList | null) => void;
}

export const CaptureButton = ({ icon: Icon, label, live, accept, onFiles }: CaptureButtonProps) => (
  <label
    className={cn(
      'inline-flex items-center justify-center gap-1.5 h-8 pointer-coarse:h-11 px-3 rounded-md border text-xs font-medium whitespace-nowrap',
      'cursor-pointer select-none transition-colors duration-200 ease-in-out active:scale-[0.98] [-webkit-tap-highlight-color:transparent]',
      'focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-background',
      live
        ? 'border-primary-500/50 text-primary-700 dark:text-primary-300 hover:border-primary-500 hover:bg-primary-500/10'
        : 'border-border text-text-secondary hover:border-border-hover hover:bg-surface-hover',
    )}
  >
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

export const UploadingHint = () => (
  <span role="status" className="inline-flex items-center gap-1.5 text-xs text-text-muted">
    <Loader size="sm" variant="slate" />
    Uploading…
  </span>
);
