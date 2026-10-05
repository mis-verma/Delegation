import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for intelligent Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading"
        className={cn(
          // bg-surface-active (not the raw slate-* this used before) tracks the app's own
          // elevation ramp, which in dark mode is a real step up from bg-surface — the old
          // slate-800/80 was barely distinguishable from a dark card's background.
          "skeleton-shimmer rounded-md bg-surface-active transition-colors duration-300",
          className
        )}
        {...props}
      >
        {/* Screen reader fallback text for accessibility */}
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
);

Skeleton.displayName = 'Skeleton';