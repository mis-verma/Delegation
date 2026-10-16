import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneScopeSwitchProps<T extends string> {
  /** The two choices, e.g. "Assigned to me" and "Created by me". `shortLabel` (e.g. "Mine",
   *  "By me") replaces the label on screens under 360px wide, where two long labels plus a filter
   *  button don't fit. */
  options: Array<{ value: T; label: string; shortLabel?: string; icon?: LucideIcon }>;
  value: T;
  /** The value that means "no choice", picked again when the active one is tapped. */
  allValue: T;
  onChange: (next: T) => void;
}

/**
 * Phone only: the one filter a person on a small screen needs on Tickets and Delegation. A two-part segmented
 * control, each side with its icon; tap one to show only that, tap it again to show everything. The full filter
 * sheet and the date picker stay on bigger screens.
 */
export const PhoneScopeSwitch = <T extends string>({ options, value, allValue, onChange }: PhoneScopeSwitchProps<T>) => (
  <div role="group" aria-label="Show" className="sm:hidden grid grid-cols-2 gap-1 flex-1 min-w-0 rounded-xl border border-border/60 bg-surface-hover/60 p-1">
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
            'inline-flex min-w-0 h-10 items-center justify-center gap-1.5 rounded-lg px-2 t-meta leading-tight font-display outline-none cursor-pointer transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
            active
              ? 'bg-surface text-primary-700 dark:text-primary-300 font-bold ring-1 ring-primary-500/30'
              : 'text-text-secondary font-semibold active:bg-surface/70',
          )}
        >
          {Icon && (
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md transition-colors duration-150',
                active ? 'bg-linear-to-br from-primary-500 to-primary-600 text-white' : 'bg-surface text-text-muted',
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" strokeWidth={2.25} />
            </span>
          )}
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
