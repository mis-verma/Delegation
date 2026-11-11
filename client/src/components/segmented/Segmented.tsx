import { useId, useState, type ReactNode } from 'react';
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

export const Segmented = <T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) => {
  const hintId = useId();
  const [shownHint, setShownHint] = useState<T | null>(null);
  const hinted = options.some((o) => o.disabled && o.hint);
  const activeHint = shownHint !== null ? options.find((o) => o.value === shownHint && o.disabled)?.hint : undefined;

  const group = (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface-hover/70 p-1 ring-1 ring-inset ring-border/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', !hinted && className)}
    >
      {options.map((o) => {
        const softDisabled = !!o.disabled && !!o.hint;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled && !softDisabled}
            aria-disabled={softDisabled || undefined}
            aria-describedby={softDisabled && activeHint ? hintId : undefined}
            title={o.disabled ? o.hint : undefined}
            onClick={() => {
              if (softDisabled) {
                setShownHint((prev) => (prev === o.value ? null : o.value));
                return;
              }
              setShownHint(null);
              onChange(o.value);
            }}
            className={cn(
              'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 cursor-pointer pointer-coarse:min-h-11',
              'focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40',
              softDisabled && 'cursor-not-allowed opacity-40',
              value === o.value ? 'bg-surface text-text ring-1 ring-border/60' : 'text-text-muted hover:text-text',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );

  if (!hinted) return group;

  return (
    <div className={cn('inline-flex max-w-full flex-col gap-1', className)}>
      {group}
      <p id={hintId} role="status" className={cn('t-meta text-text-muted', !activeHint && 'sr-only')}>
        {activeHint ?? ''}
      </p>
    </div>
  );
};
