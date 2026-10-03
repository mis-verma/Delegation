import { AlertCircle } from 'lucide-react';
import { Button } from '../button';
import { cn } from '@/lib/utils';

interface InlineErrorProps {
  message: string;
  /** Shows a Retry button when given. */
  onRetry?: () => void;
  className?: string;
}

// The one "this did not load" strip for a page or a section. Every checklist screen used to hand-roll
// its own (different radius, padding and Retry button). Announced to screen readers via role="alert".
export const InlineError = ({ message, onRetry, className }: InlineErrorProps) => (
  <div role="alert" className={cn('flex items-center gap-2.5 p-3 rounded-lg border border-danger/20 bg-danger/10 text-danger text-xs font-display', className)}>
    <AlertCircle size={15} className="shrink-0" aria-hidden />
    <span className="flex-1 min-w-0">{message}</span>
    {onRetry && (
      <Button size="sm" variant="outline" className="shrink-0 border-danger/30 text-danger hover:border-danger/50 hover:bg-danger/10" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);
