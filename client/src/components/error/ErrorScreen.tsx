import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { Home, RefreshCcw, AlertTriangle, SearchX, WifiOff, type LucideIcon } from 'lucide-react';
import { Button } from '../button';
import { BrandLogo } from '../brandLogo';

interface ErrorScreenProps {
  code?: string | number;
  title: string;
  message?: string;
  details?: string;
  onRetry?: () => void;
}

const lookFor = (code?: string | number): { Icon: LucideIcon; tile: string; tag: string } => {
  if (code === 404) return { Icon: SearchX, tile: 'bg-primary-500/10 text-primary-600 dark:text-primary-300', tag: 'Page not found' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { Icon: WifiOff, tile: 'bg-warning/10 text-warning', tag: 'You are offline' };
  return { Icon: AlertTriangle, tile: 'bg-danger/10 text-danger', tag: code ? `Error ${code}` : 'Something went wrong' };
};

export const ErrorScreen = ({ code, title, message, details, onRetry }: ErrorScreenProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { Icon, tile, tag } = lookFor(code);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border/60 bg-surface px-5 py-7 text-center animate-in fade-in zoom-in-95 duration-200 sm:px-7">
        <BrandLogo className="size-8" textClassName="text-base" />

        <div className="flex flex-col items-center gap-3">
          <span className={`flex size-12 items-center justify-center rounded-2xl ${tile}`} aria-hidden="true">
            <Icon size={22} strokeWidth={2.25} />
          </span>
          {tag.toLowerCase() !== title.toLowerCase() && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5 t-meta font-display font-semibold text-text-muted">{tag}</span>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="t-card font-display font-bold text-text">{title}</h1>
            {message && <p className="t-meta text-text-muted leading-relaxed">{message}</p>}
          </div>
        </div>

        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="h-10 w-full sm:w-auto sm:flex-1 gap-1.5 font-display" onClick={() => navigate('/')}>
            <Home size={15} aria-hidden="true" />
            Back to dashboard
          </Button>
          {onRetry && (
            <Button variant="primary" className="group/retry h-10 w-full sm:w-auto sm:flex-1 gap-1.5 font-display" onClick={onRetry}>
              <RefreshCcw size={15} className="transition-transform duration-500 group-hover/retry:rotate-180" aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
        {details && user?.role === 'ADMIN' && (
          <details className="w-full rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2 text-left">
            <summary className="cursor-pointer t-meta font-display font-semibold text-text-secondary">Show details</summary>
            <p className="pt-2 t-meta font-mono break-words text-text-muted">{details}</p>
          </details>
        )}
        <p className="t-meta text-text-light">If this keeps happening, tell your admin what you were doing.</p>
      </div>
    </div>
  );
};
