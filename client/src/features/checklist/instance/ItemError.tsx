import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ItemErrorProps {
  /** The mutation error (or a plain message). Renders nothing while there is none. */
  error: unknown;
  /** Shown when the error carries no readable message. */
  fallback: string;
  className?: string;
}

// The one inline "that didn't save" line under an item's controls. Announced to screen readers.
export const ItemError = ({ error, fallback, className }: ItemErrorProps) => {
  if (error == null || error === false) return null;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 text-xs text-danger', className)}>
      <AlertCircle size={12} className="shrink-0 mt-0.5" aria-hidden />
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
};
