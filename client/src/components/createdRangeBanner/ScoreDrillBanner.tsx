import { Filter, X } from 'lucide-react';
import type { ScoreDrill } from '../../lib/scoreDrill';

interface ScoreDrillBannerProps {
  drill: ScoreDrill;
  noun: string;
  scopeLabel?: string;
}

export const ScoreDrillBanner = ({ drill, noun, scopeLabel }: ScoreDrillBannerProps) => {
  if (!drill.active) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <Filter size={16} aria-hidden className="shrink-0 text-text-muted" />
      <p className="flex-1 min-w-0 text-sm font-display font-medium text-text-secondary">
        Showing {noun}{scopeLabel ? ` for ${scopeLabel}` : ''}
        {drill.description && <> <span className="font-semibold text-text">{drill.description}</span></>}
      </p>
      <button
        type="button"
        onClick={drill.clear}
        className="inline-flex items-center gap-1 h-9 pointer-coarse:h-11 px-2.5 rounded-lg text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <X size={13} aria-hidden />
        Show all
      </button>
    </div>
  );
};
