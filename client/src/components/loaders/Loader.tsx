import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'white' | 'slate' | 'rose';
}

const sizeClasses = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
  xl: 'size-12 border-[4px]',
};

const variantClasses = {
  primary: 'border-primary-600/20 border-t-primary-600',
  white: 'border-white/20 border-t-white',
  slate: 'border-border border-t-text-muted',
  rose: 'border-danger/20 border-t-danger',
};

export const Loader = React.forwardRef<HTMLDivElement, LoaderProps>(
  ({ size = 'md', variant = 'primary', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          "rounded-full animate-spin transition-all duration-300",
          sizeClasses[size],
          variantClasses[variant],
          className
        )}
        {...props}
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
);

Loader.displayName = 'Loader';