import type { ReactNode } from 'react';
import { Check, Shirt, X, type LucideIcon } from 'lucide-react';
import { IconChip } from '../../../components';
import { cn } from '@/lib/utils';

export const AuditUniformChip = ({ label }: { label: string }) => (
  <IconChip icon={Shirt} label={label} title="Uniform that applies" />
);

// Label on the left, optional count beside it, optional action on the right. The fixed min height
// keeps headers with and without an action level.
export const AuditSectionHeader = ({ label, meta, action }: { label: string; meta?: ReactNode; action?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 min-h-8 pointer-coarse:min-h-11">
    <p className="flex items-center gap-1.5 text-[13px] sm:text-xs font-semibold text-text-secondary">
      {label}
      {meta && <span className="flex items-center gap-1 font-medium text-text-muted tabular-nums">{meta}</span>}
    </p>
    {action}
  </div>
);

interface AuditTickRowProps {
  name:        string;
  checked:     boolean;
  /** Submitted and not ticked: drawn as a clear miss. */
  missing:     boolean;
  interactive: boolean;
  onToggle:    () => void;
}

// A big, full-width row: tap anywhere on it to tick. Checked reads as a success tint plus a filled
// check circle, so the state is never carried by colour alone.
export const AuditTickRow = ({ name, checked, missing, interactive, onToggle }: AuditTickRowProps) => {
  const className = cn(
    'flex w-full items-center gap-3 min-h-13 sm:min-h-11 px-3 py-2 rounded-lg border text-left select-none',
    'transition-[background-color,border-color,color,transform] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
    checked
      ? 'border-success/50 bg-success/10 dark:bg-success/15 text-text'
      : missing
        ? 'border-danger/30 bg-surface text-text-secondary'
        : 'border-border/60 bg-surface text-text-secondary',
    interactive && 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.99]',
    interactive && !checked && 'hover:border-border-hover hover:bg-surface-hover',
  );
  const circle = (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center size-6 sm:size-5 rounded-full border-2 shrink-0 transition-colors duration-150',
        checked ? 'bg-success border-success text-white' : missing ? 'border-danger/40 text-danger' : 'border-border-hover bg-surface',
      )}
    >
      {missing ? (
        <X className="size-3.5 sm:size-3" strokeWidth={3} />
      ) : (
        <Check
          className={cn('size-4 sm:size-3 transition-transform duration-150 ease-out motion-reduce:transition-none', checked ? 'scale-100' : 'scale-0')}
          strokeWidth={3.25}
        />
      )}
    </span>
  );
  const label = <span className="flex-1 min-w-0 text-[15px] sm:text-sm font-medium leading-snug break-words">{name}</span>;

  if (!interactive) {
    return (
      <div className={className}>
        {circle}
        {label}
        <span className="sr-only">{checked ? ', has it' : missing ? ', missing' : ', not checked yet'}</span>
      </div>
    );
  }
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className={className}>
      {circle}
      {label}
    </button>
  );
};

interface AuditCaptureButtonProps {
  icon:    LucideIcon;
  label:   string;
  /** Live capture (opens the camera) gets the primary tint; the gallery picker stays neutral. */
  live:    boolean;
  accept:  string;
  onFiles: (files: FileList | null) => void;
}

// Same behaviour as CaptureButton (hidden file input inside a label, camera when live) but 48px
// tall and flexible in width, so Take photo and Gallery sit side by side across a phone.
export const AuditCaptureButton = ({ icon: Icon, label, live, accept, onFiles }: AuditCaptureButtonProps) => (
  <label
    className={cn(
      'flex flex-1 sm:flex-none sm:min-w-32 items-center justify-center gap-2 h-12 sm:h-10 px-4 rounded-lg border text-[15px] sm:text-xs font-medium whitespace-nowrap',
      'cursor-pointer select-none transition-colors duration-200 ease-in-out active:scale-[0.98] [-webkit-tap-highlight-color:transparent]',
      'focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-background',
      live
        ? 'border-primary-500/50 text-primary-700 dark:text-primary-300 hover:border-primary-500 hover:bg-primary-500/10'
        : 'border-border text-text-secondary hover:border-border-hover hover:bg-surface-hover',
    )}
  >
    <Icon className="size-[18px] sm:size-3.5" aria-hidden />
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
