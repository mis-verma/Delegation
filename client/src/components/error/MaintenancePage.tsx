import { Construction, RefreshCcw } from 'lucide-react';
import { Button } from '../button';

interface MaintenancePageProps {
  title?: string;
  message?: string;
  estimatedReturn?: string;
  onRetry?: () => void;
}

export const MaintenancePage = ({
  title = "We'll be right back",
  message = "We're rolling out some improvements right now. Thanks for your patience — try again in a few minutes.",
  estimatedReturn,
  onRetry = () => window.location.reload(),
}: MaintenancePageProps) => (
  <div
    className="flex min-h-svh items-center justify-center p-4 relative overflow-hidden"
    style={{ background: 'var(--color-background)' }}
  >
    <span className="absolute -top-24 -left-24 size-72 rounded-full bg-primary-400/10 blur-3xl pointer-events-none" />
    <span className="absolute -bottom-24 -right-24 size-72 rounded-full bg-coral-400/20 blur-3xl pointer-events-none" />
    <span className="absolute top-1/3 right-16 size-40 rounded-full bg-primary-300/10 blur-2xl pointer-events-none" />

    <div
      className="relative z-10 w-full max-w-md text-center flex flex-col items-center gap-5 p-8 sm:p-10 rounded-2xl border border-border/60 animate-scale-in"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
      }}
    >
      <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 sm:size-20 dark:bg-primary-500/15 dark:text-primary-400">
        <Construction size={28} strokeWidth={1.75} className="sm:size-8" />
        <span className="absolute inset-0 rounded-2xl border border-primary-400/30 animate-ping" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-display font-bold text-text sm:text-xl">{title}</h1>
        <p className="text-sm text-text-muted font-display max-w-sm">{message}</p>
      </div>

      {estimatedReturn && (
        <span className="inline-flex items-center justify-center rounded-full border border-border/60 bg-surface-hover px-3 py-1 t-meta font-medium text-text-secondary">
          {estimatedReturn}
        </span>
      )}

      <Button variant="primary" size="sm" className="gap-1.5 mt-1" onClick={onRetry}>
        <RefreshCcw size={14} />
        Try again
      </Button>
    </div>
  </div>
);
