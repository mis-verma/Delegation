import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TOGGLE_ITEM, TOGGLE_OFF, TOGGLE_ON, TOGGLE_SIZE_SM, TOGGLE_TRACK, TogglePill } from '../slidingTabs';

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
  const pillId = useId();
  const [shownHint, setShownHint] = useState<T | null>(null);
  const hinted = options.some((o) => o.disabled && o.hint);
  const activeHint = shownHint !== null ? options.find((o) => o.value === shownHint && o.disabled)?.hint : undefined;

  const group = (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(TOGGLE_TRACK, !hinted && className)}
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
              TOGGLE_ITEM,
              TOGGLE_SIZE_SM,
              softDisabled && 'cursor-not-allowed opacity-40',
              value === o.value ? TOGGLE_ON : TOGGLE_OFF,
            )}
          >
            {value === o.value && <TogglePill id={`${pillId}-pill`} />}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
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
