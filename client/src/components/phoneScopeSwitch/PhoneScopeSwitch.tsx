import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneScopeSwitchProps<T extends string> {
  options: Array<{ value: T; label: string; shortLabel?: string; icon?: LucideIcon }>;
  value: T;
  allValue: T;
  onChange: (next: T) => void;
}

export const PhoneScopeSwitch = <T extends string>({ options, value, allValue, onChange }: PhoneScopeSwitchProps<T>) => (
  <div role="group" aria-label="Show" className="grid min-w-0 flex-1 grid-cols-2 gap-0.5 rounded-md border border-border bg-surface p-0.5 sm:w-auto sm:max-w-sm sm:flex-none">
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
            'inline-flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm px-2.5 t-meta font-display leading-tight outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-[1.875rem] [-webkit-tap-highlight-color:transparent]',
            active ? 'bg-primary-800 font-bold text-white shadow-[inset_0_-2px_0_var(--color-gold)]' : 'font-semibold text-text-secondary hover:bg-surface-hover hover:text-text',
          )}
        >
          {Icon && <Icon className="size-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
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
