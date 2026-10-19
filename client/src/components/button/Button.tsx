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

const PRIMARY_TOUCH_CLASS =
  'pointer-coarse:bg-primary-800 dark:pointer-coarse:bg-primary-500 pointer-coarse:text-white pointer-coarse:disabled:bg-surface-active dark:pointer-coarse:disabled:bg-surface-active pointer-coarse:disabled:text-text';
const hasOwnBackground = (className: unknown) =>
  typeof className === 'string' && /(^|\s)(bg-|from-)/.test(className);

const sizeMap: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 pointer-coarse:h-11 px-3 text-xs gap-1.5 rounded-md',
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
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        'transition-all duration-200 ease-in-out cursor-pointer select-none',
        'active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
          variant={variant === 'danger' ? 'white' : 'slate'}
        />
      )}
      <span className={cn('inline-flex items-center gap-inherit', isLoading && 'opacity-90')}>
        {children}
      </span>
    </button>
  );
}
