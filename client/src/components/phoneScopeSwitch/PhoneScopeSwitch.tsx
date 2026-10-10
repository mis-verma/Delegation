import { cn } from '@/lib/utils';

interface PhoneScopeSwitchProps<T extends string> {
  /** The two choices, e.g. "Assigned to me" and "Created by me". `shortLabel` (e.g. "Mine",
   *  "By me") replaces the label on screens under 360px wide, where two long labels plus a filter
   *  button don't fit. */
  options: Array<{ value: T; label: string; shortLabel?: string }>;
  value: T;
  /** The value that means "no choice", picked again when the active one is tapped. */
  allValue: T;
  onChange: (next: T) => void;
}

/**
 * Phone only: the one filter a person on a small screen needs on Tickets and Delegation. Two pills side by
 * side; tap one to show only that, tap it again to show everything. The full filter sheet and the date
 * picker stay on bigger screens.
 */
export const PhoneScopeSwitch = <T extends string>({ options, value, allValue, onChange }: PhoneScopeSwitchProps<T>) => (
  <div role="group" aria-label="Show" className="sm:hidden grid grid-cols-2 gap-2 flex-1 min-w-0">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={active}
          aria-label={o.label}
          onClick={() => onChange(active ? allValue : o.value)}
          className={cn(
            'min-w-0 h-11 rounded-full border px-2 t-meta leading-tight font-display truncate outline-none cursor-pointer transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
            // Picked: a calm outline and bold word, not a solid blue pill.
            active
              ? 'border-primary-600 bg-surface text-primary-700 dark:border-primary-400 dark:text-primary-300 font-bold'
              : 'border-border bg-surface text-text-secondary font-semibold hover:border-border-hover active:bg-surface-hover',
          )}
        >
          {o.shortLabel ? (
            <>
              <span className="max-[359px]:hidden">{o.label}</span>
              <span className="hidden max-[359px]:inline">{o.shortLabel}</span>
            </>
          ) : o.label}
        </button>
      );
    })}
  </div>
);
