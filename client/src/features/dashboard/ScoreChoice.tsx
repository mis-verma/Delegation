import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoreChoiceProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  icons?: Partial<Record<T, LucideIcon>>;
  onChange: (value: T) => void;
  className?: string;
}

export function ScoreChoice<T extends string>({ label, value, options, labels, icons, onChange, className }: ScoreChoiceProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((option) => {
        const Icon = icons?.[option] as LucideIcon | undefined;
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 ease-out pointer-coarse:min-h-11 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
              active
                ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
                : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text',
            )}
          >
            {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
