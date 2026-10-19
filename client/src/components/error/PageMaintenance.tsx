import { Construction, RefreshCcw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../button';

interface PageMaintenanceProps {
  pageName?: string;
  message?: string;
  estimatedReturn?: string;
}

export const PageMaintenance = ({
  pageName = 'This page',
  message = "We're updating it right now. It'll be back shortly — everything else is still available.",
  estimatedReturn,
}: PageMaintenanceProps) => {
  const navigate = useNavigate();

  return (
  <div className="flex flex-1 items-center justify-center py-12 sm:py-20">
    <div
      role="status"
      className="w-full max-w-md text-center flex flex-col items-center gap-5 p-8 sm:p-10 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface animate-in fade-in zoom-in-95 duration-300"
    >
      <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-400">
        <Construction size={28} strokeWidth={1.75} />
        <span className="absolute inset-0 rounded-2xl border border-primary-400/30 motion-safe:animate-ping" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg sm:text-xl font-display font-bold text-text">{pageName} is under maintenance</h1>
        <p className="text-sm text-text-muted font-display max-w-sm">{message}</p>
      </div>

      {estimatedReturn && (
        <span className="inline-flex items-center justify-center rounded-full border border-border/60 bg-surface-hover px-3 py-1 text-xs font-medium text-text-secondary">
          {estimatedReturn}
        </span>
      )}

      <div className="flex items-center gap-2.5 flex-wrap justify-center">
        <Button variant="primary" size="sm" className="gap-1.5" onClick={() => window.location.reload()}>
          <RefreshCcw size={14} />
          Try again
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/')}>
          <ArrowLeft size={14} />
          Back to dashboard
        </Button>
      </div>
    </div>
  </div>
  );
};
