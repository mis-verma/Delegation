import type { LucideIcon } from 'lucide-react';
import { Zap } from 'lucide-react';
import { QuickActionButton } from './QuickActionButton';

export interface QuickAction {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

interface QuickActionsGridProps {
  actions: readonly QuickAction[];
  /** Defaults suit both callers this ships with (Admin Overview, the user Dashboard) — override
   *  only if a third caller needs different copy. */
  title?: string;
  description?: string;
}

// A plain component now, not a fixed admin-only action list — OrgOverview.tsx and HomePage.tsx
// each pass their own `actions`, so the same shell (icon tile, header, responsive button grid)
// is shared instead of duplicated for the user-facing dashboard's own version of this card.
export const QuickActionsGrid = ({ actions, title = 'Quick actions', description = 'Jump straight to the tools you use most' }: QuickActionsGridProps) => (
  <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface">
    {/* Decorative glow, matching RecentActivity's panel language */}
    <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl" />

    <div className="relative z-10 flex items-center gap-3 border-b border-border/40 bg-surface/50 px-6 py-5 backdrop-blur-sm">
      <div className="flex items-center justify-center rounded-lg border border-border/50 bg-surface-hover p-2">
        <Zap size={18} className="text-primary-500" />
      </div>
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-text">{title}</h2>
        <p className="mt-0.5 font-display text-xs text-text-muted">{description}</p>
      </div>
    </div>

    <div className="relative z-10 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-3">
      {actions.map((action) => (
        <QuickActionButton key={action.to} {...action} />
      ))}
    </div>
  </section>
);
