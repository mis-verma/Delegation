import type { ButtonHTMLAttributes } from 'react';
import { Loader } from '../loaders/Loader';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

// Option B from the reference (see conversation) — the one actually picked, implemented faithfully
// rather than softened back toward Option A. No shadow anywhere. Primary starts as a quiet neutral
// pill (bg-surface-active) and only resolves to the app's own navy the moment it's touched —
// that's still "beautify with theme colors", just spent on the hover state instead of permanently,
// so a screen with several buttons doesn't read as several equally-loud navy blocks. Secondary
// stays borderless until hovered, danger stays flat with no shadow.
const variantMap: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-surface-active text-text border border-transparent hover:bg-primary-900 hover:text-white focus-visible:ring-primary-500',
  secondary:
    'bg-transparent text-text-secondary border border-transparent hover:bg-surface-hover hover:border-border hover:text-text focus-visible:ring-primary-500',
  outline:
    'bg-transparent text-text-secondary border border-border hover:border-border-hover hover:bg-surface-hover focus-visible:ring-primary-500',
  ghost:
    'bg-transparent text-text-muted border border-transparent hover:bg-surface-hover hover:text-text focus-visible:ring-primary-500',
  danger:
    'bg-danger text-white border border-transparent hover:bg-danger/90 focus-visible:ring-danger',
};

// Touch screens (pointer-coarse) get the primary navy at rest: they never hover, so there the quiet
// neutral above was the button's permanent look and an enabled primary action (Create, Move to…)
// read as disabled. Disabled stays neutral there, so ready vs not-ready is distinguishable. Skipped
// when the caller sets its own background (green Approve, red Reject, the login gradient) — those
// already carry their meaning in color and must not all turn navy on a phone.
const PRIMARY_TOUCH_CLASS =
  'pointer-coarse:bg-primary-800 pointer-coarse:text-white pointer-coarse:disabled:bg-surface-active pointer-coarse:disabled:text-text';
const hasOwnBackground = (className: unknown) =>
  typeof className === 'string' && /(^|\s)(bg-|from-)/.test(className);

const sizeMap: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-6 text-base gap-2 rounded-md',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={isLoading}
      className={cn(
        'press-feedback',
        // Base styles: Flexbox layout & typography
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        // Smooth transitions and micro-interactions
        'transition-all duration-200 ease-in-out cursor-pointer select-none',
        'active:scale-[0.98]',
        // Universal accessibility focus rings — ring-offset-background (not the Tailwind
        // default white) so the offset gap reads correctly in dark mode too.
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        // Rock-solid disabled states based on your color scheme
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100',
        sizeMap[size],
        variantMap[variant],
        variant === 'primary' && !hasOwnBackground(className) && PRIMARY_TOUCH_CLASS,
        className
      )}
      {...props}
    >
      {isLoading && (
        <Loader
          size={size === 'lg' ? 'md' : 'sm'}
          // `disabled:pointer-events-none` means a loading (disabled) button never actually shows
          // its hover state, so primary reads in its neutral resting look while loading — a white
          // spinner on that light neutral fill would nearly disappear, same reason `secondary`/
          // `ghost`/`outline` already get the dark `slate` spinner instead of `white`.
          variant={variant === 'danger' ? 'white' : 'slate'}
        />
      )}
      <span className={cn('inline-flex items-center gap-inherit', isLoading && 'opacity-90')}>
        {children}
      </span>
    </button>
  );
}
