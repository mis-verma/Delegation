import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneScopeSwitchProps<T extends string> {
  options: Array<{ value: T; label: string; shortLabel?: string; icon?: LucideIcon }>;
  value: T;
  allValue: T;
  onChange: (next: T) => void;
}

export const PhoneScopeSwitch = <T extends string>({ options, value, allValue, onChange }: PhoneScopeSwitchProps<T>) => (
  <div role="group" aria-label="Show" className="sm:hidden grid grid-cols-2 gap-1 flex-1 min-w-0 rounded-2xl border border-border bg-surface-hover/70 p-1">
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
            'inline-flex min-w-0 h-11 items-center justify-center gap-2 rounded-xl px-2.5 t-meta leading-tight font-display outline-none cursor-pointer transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
            active
              ? 'bg-surface text-primary-700 dark:text-primary-300 font-bold ring-1 ring-primary-500/40'
              : 'text-text-secondary font-semibold active:bg-surface/70',
          )}
        >
          {Icon && (
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150',
                active ? 'bg-linear-to-br from-primary-500 to-primary-600 text-white' : 'bg-primary-500/10 text-primary-600 dark:text-primary-300',
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" strokeWidth={2.25} />
            </span>
          )}
          {active && <Check className="size-3.5 shrink-0 order-last text-primary-600 dark:text-primary-300" strokeWidth={3} aria-hidden="true" />}
          <span className="truncate">
            {o.shortLabel ? (
              <>
                <span className="max-[359px]:hidden">{o.label}</span>
                <span className="hidden max-[359px]:inline">{o.shortLabel}</span>
              </>
            ) : o.label}
          </span>
        </button>
      );
    })}
  </div>
);
