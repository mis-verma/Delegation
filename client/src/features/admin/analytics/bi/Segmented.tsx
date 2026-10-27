import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  hint?: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export const Segmented = <T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/60 bg-surface-hover/50 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
  >
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        disabled={o.disabled}
        title={o.disabled ? o.hint : undefined}
        onClick={() => onChange(o.value)}
        className={cn(
          'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 cursor-pointer pointer-coarse:min-h-11',
          'focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40',
          value === o.value ? 'bg-surface text-text ring-1 ring-border' : 'text-text-muted hover:text-text',
        )}
      >
        {o.icon}
        {o.label}
      </button>
    ))}
  </div>
);
