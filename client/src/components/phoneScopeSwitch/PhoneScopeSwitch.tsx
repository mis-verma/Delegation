import { cn } from '@/lib/utils';

interface PhoneScopeSwitchProps<T extends string> {
  /** The two choices, e.g. "Assigned to me" and "Created by me". */
  options: Array<{ value: T; label: string }>;
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
          onClick={() => onChange(active ? allValue : o.value)}
          className={cn(
            'h-10 rounded-full border px-3 text-[13px] font-display font-semibold truncate outline-none cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
            active
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-border bg-surface text-text-secondary active:bg-surface-hover',
          )}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);
