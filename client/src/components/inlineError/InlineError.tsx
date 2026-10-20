import { AlertCircle } from 'lucide-react';
import { Button } from '../button';
import { cn } from '@/lib/utils';

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const InlineError = ({ message, onRetry, className }: InlineErrorProps) => (
  <div role="alert" className={cn('flex items-center gap-2.5 p-3 rounded-lg border border-danger/20 bg-danger/10 text-danger t-meta font-display', className)}>
    <AlertCircle size={15} className="shrink-0" aria-hidden />
    <span className="flex-1 min-w-0">{message}</span>
    {onRetry && (
      <Button size="sm" variant="outline" className="shrink-0 border-danger/30 text-danger hover:border-danger/50 hover:bg-danger/10" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);
