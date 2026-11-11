import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlidingTabOption<T extends string> {
  value: T;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
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
  className?: string;
}

const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 } as const;

export function SlidingTabs<T extends string>({ label, value, options, onChange, size = 'md', className }: SlidingTabsProps<T>) {
  const groupId = useId();
  const reduce = useReducedMotion();
  const small = size === 'sm';

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface-hover/70 p-1 ring-1 ring-inset ring-border/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        const Trailing = option.trailing;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'group relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-4 font-display font-semibold outline-none transition-colors duration-150 ease-out select-none active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/60',
              small ? 'min-h-11 t-meta sm:min-h-9' : 'min-h-11 t-card sm:min-h-10',
              active ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {active && (
              <motion.span
                layoutId={`${groupId}-pill`}
                transition={reduce ? { duration: 0 } : SPRING}
                className="absolute inset-0 rounded-full bg-surface ring-1 ring-border/60"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Icon className={cn('shrink-0', small ? 'size-3.5' : 'size-4')} strokeWidth={2.4} aria-hidden="true" />
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
