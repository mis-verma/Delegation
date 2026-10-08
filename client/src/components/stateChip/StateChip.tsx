import { cn } from '@/lib/utils';

interface StateChipProps {
  active: boolean;
  /** Word shown. Defaults to "Active" / "Inactive"; people say "Deactivated". */
  label?: string;
  /** Smaller, for a row inside a dense table or a tree. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Whether a person, department or store is switched on. A soft green gradient pill with a ringed
 * dot for active; a quiet grey pill with a hollow dot for off. The word is always written out, so
 * the state never relies on colour alone. Border only, no shadow.
 */
export const StateChip = ({ active, label, size = 'md', className }: StateChipProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 shrink-0 rounded-full border font-display font-semibold whitespace-nowrap',
      size === 'md' ? 'h-6 pl-2 pr-2.5 text-xs' : 'h-5 pl-1.5 pr-2 text-[0.6875rem]',
      active
        ? 'border-success/25 bg-gradient-to-r from-success/15 to-success/5 text-success'
        : 'border-border bg-surface-hover/70 text-text-muted',
      className,
    )}
  >
    <span
      aria-hidden
      className={cn(
        'rounded-full shrink-0',
        size === 'md' ? 'size-2' : 'size-1.5',
        active ? 'bg-success ring-[3px] ring-success/20' : 'border-[1.5px] border-text-light bg-transparent',
      )}
    />
    {label ?? (active ? 'Active' : 'Inactive')}
  </span>
);
