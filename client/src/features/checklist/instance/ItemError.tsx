import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ItemErrorProps {
  error: unknown;
  fallback: string;
  className?: string;
}

export const ItemError = ({ error, fallback, className }: ItemErrorProps) => {
  if (error == null || error === false) return null;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 t-meta text-danger', className)}>
      <AlertCircle size={12} className="shrink-0 mt-0.5" aria-hidden />
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
};
