import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneScopeSwitchProps<T extends string> {
  options: Array<{ value: T; label: string; shortLabel?: string; icon?: LucideIcon }>;
  value: T;
  allValue: T;
  onChange: (next: T) => void;
}

export const PhoneScopeSwitch = <T extends string>({ options, value, allValue, onChange }: PhoneScopeSwitchProps<T>) => (
  <div role="group" aria-label="Show" className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-full bg-surface-hover/70 p-1 ring-1 ring-inset ring-border/50 sm:w-auto sm:max-w-sm sm:flex-none">
    {options.map((o) => {
      const active = value === o.value;
      const Icon = o.icon;
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={active}
          aria-label={o.label}
          onClick={() => onChange(active ? allValue : o.value)}
          className={cn(
            'inline-flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-full px-3 t-meta font-display leading-tight outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-[1.875rem] [-webkit-tap-highlight-color:transparent]',
            active ? 'bg-surface font-bold text-text ring-1 ring-border/60' : 'font-semibold text-text-muted hover:text-text',
          )}
        >
          {Icon && <Icon className={cn('size-4 shrink-0', active && 'text-primary-700 dark:text-primary-300')} strokeWidth={2.25} aria-hidden="true" />}
          <span className="truncate">
            {o.shortLabel ? (
              <>
                <span className="2xl:hidden">{o.shortLabel}</span>
                <span className="hidden 2xl:inline">{o.label}</span>
              </>
            ) : o.label}
          </span>
        </button>
      );
    })}
  </div>
);
