import { type ElementType } from 'react';
import { AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for intelligent Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
 
// --- Error Message Component ---

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export const ErrorMessage = ({ message, className }: ErrorMessageProps) => (
  <div
    role="alert"
    className={cn(
      "flex items-start gap-3 p-4 rounded-xl",
      "bg-danger/10 border border-danger/20",
      "text-danger text-sm font-medium",
      "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out",
      className
    )}
  >
    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
    <p className="leading-relaxed">{message}</p>
  </div>
);

// --- Empty State Component ---

interface EmptyStateProps {
  label: string;
  description?: string;
  Icon: ElementType;
  className?: string;
}

export const EmptyState = ({ label, description, Icon, className }: EmptyStateProps) => (
  <section
    aria-label={label}
    className={cn(
      "flex flex-col items-center justify-center py-16 sm:py-20 px-4 text-center",
      "rounded-3xl border-2 border-border",
      "bg-surface-hover/50",
      "animate-in fade-in duration-500",
      className
    )}
  >
    <div className="flex items-center justify-center mb-4 size-14 rounded-full bg-surface border border-border text-text-muted">
      <Icon className="w-6 h-6" strokeWidth={1.5} />
    </div>

    <h3 className="text-base sm:text-lg font-bold text-text">
      {label}
    </h3>

    {description && (
      <p className="text-sm text-text-muted max-w-sm mt-2 leading-relaxed">
        {description}
      </p>
    )}
  </section>
);