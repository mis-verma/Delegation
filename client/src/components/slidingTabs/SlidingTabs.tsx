import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOGGLE_ITEM, TOGGLE_OFF, TOGGLE_ON, TOGGLE_SIZE_MD, TOGGLE_SIZE_SM, TOGGLE_TRACK, TogglePill } from './toggleStyle';

export interface SlidingTabOption<T extends string> {
  value: T;
  label: string;
  shortLabel?: string;
  icon?: LucideIcon;
  badge?: number;
  badgeTone?: 'primary' | 'danger';
  trailing?: LucideIcon;
  ariaLabel?: string;
}

interface SlidingTabsProps<T extends string> {
  label: string;
  value: T;
  options: readonly SlidingTabOption<T>[];
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
  fill?: boolean;
  pressed?: boolean;
  className?: string;
}

export function SlidingTabs<T extends string>({ label, value, options, onChange, size = 'md', fill = false, pressed = false, className }: SlidingTabsProps<T>) {
  const groupId = useId();
  const small = size === 'sm';

  return (
    <div role={pressed ? 'group' : 'tablist'} aria-label={label} className={cn(TOGGLE_TRACK, fill && 'flex w-full', className)}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        const Trailing = option.trailing;
        return (
          <button
            key={option.value}
            type="button"
            role={pressed ? undefined : 'tab'}
            aria-selected={pressed ? undefined : active}
            aria-pressed={pressed ? active : undefined}
            aria-label={option.ariaLabel}
            tabIndex={pressed || active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(TOGGLE_ITEM, small ? TOGGLE_SIZE_SM : TOGGLE_SIZE_MD, fill && 'min-w-0 flex-1', active ? TOGGLE_ON : TOGGLE_OFF)}
          >
            {active && <TogglePill id={`${groupId}-pill`} />}
            <span className="relative z-10 flex min-w-0 items-center gap-2">
              {Icon && <Icon className={cn('shrink-0', small ? 'size-3.5' : 'size-4', active && 'text-primary-700 dark:text-primary-300')} strokeWidth={2.4} aria-hidden="true" />}
              <span className="whitespace-nowrap">
                {option.shortLabel ? (
                  <>
                    <span className="sm:hidden">{option.shortLabel}</span>
                    <span className="max-sm:hidden">{option.label}</span>
                  </>
                ) : option.label}
              </span>
              {option.badge !== undefined && option.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 t-meta font-bold tabular-nums',
                    option.badgeTone === 'danger'
                      ? 'bg-vivid-red/10 text-vivid-red-text'
                      : 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
                  )}
                  aria-hidden="true"
                >
                  {option.badge > 99 ? '99+' : option.badge}
                </span>
              )}
              {Trailing && <Trailing className="size-3.5 shrink-0 opacity-70 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
