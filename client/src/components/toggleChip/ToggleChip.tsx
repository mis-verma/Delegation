import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const BASE =
  'inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full border text-xs font-display font-medium cursor-pointer ' +
  'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed';

interface ToggleChipProps {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  /** 'good' tints the selected state green (acceptable answers); the default is the primary tint. */
  tone?: 'primary' | 'good';
  disabled?: boolean;
  className?: string;
}

// The one selectable pill: weekdays, answer options, "Yes is good", filters. A flat tint when on,
// a border-colour change on hover (no shadow, per the app's card convention).
export const ToggleChip = ({ on, onClick, children, tone = 'primary', disabled, className }: ToggleChipProps) => (
  <button
    type="button"
    aria-pressed={on}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      BASE,
      on
        ? tone === 'good'
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300'
        : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text',
      className,
    )}
  >
    {children}
  </button>
);

// The dashed "add another" pill that sits at the end of a chip row.
export const AddChip = ({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(BASE, 'border-dashed border-border text-text-secondary hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300')}
  >
    <Plus size={13} aria-hidden />
    {children}
  </button>
);
