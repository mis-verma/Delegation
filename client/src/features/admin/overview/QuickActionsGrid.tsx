import type { LucideIcon } from 'lucide-react';
import { Zap } from 'lucide-react';
import { EntityIconTile } from '../../../components';
import { DASHBOARD_CARD_CLASS } from '../../dashboard/dashboardDisplay';
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
// Header/shell now matches every other Dashboard card's shared convention (RecentActivity,
// UpcomingEvents: DASHBOARD_CARD_CLASS + the same px-4 sm:px-5 py-4 border-b/backdrop-blur-xl
// header band) instead of a bespoke padding/blur/border that only this card used — this was the
// one section whose outer rhythm didn't line up with its neighbors. The action grid itself moved
// to 4 columns at `lg`, matching the KPI strip above it, so card edges actually align down the
// page instead of the two grids sitting on unrelated column widths.
export const QuickActionsGrid = ({ actions, title = 'Quick actions', description = 'Jump straight to the tools you use most' }: QuickActionsGridProps) => (
  // @container: this now shares a row with Activity Overview on the user Dashboard (half the
  // viewport wide) but still renders full-width on Admin Overview — a viewport breakpoint would
  // force 4 columns into that half-width column too, cramming each button down to almost nothing.
  // Sized off this card's own rendered width instead, same reasoning TeamProgressCard/
  // MonthlyTargetCard already use for the same dual-width-context problem.
  <section className={`relative overflow-hidden @container ${DASHBOARD_CARD_CLASS}`}>
    {/* Decorative glow, matching RecentActivity's panel language */}
    <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl" />

    <div className="relative z-10 flex items-center gap-3.5 border-b border-border/40 bg-surface/50 px-4 sm:px-5 py-4 backdrop-blur-xl">
      <EntityIconTile icon={Zap} tone="coral" />
      <div>
        <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-text">{title}</h2>
        <p className="mt-0.5 font-display text-[11px] sm:text-xs font-medium text-text-muted">{description}</p>
      </div>
    </div>

    <div className="relative z-10 grid grid-cols-1 gap-3 p-4 @sm:grid-cols-2 @sm:gap-3.5 @sm:p-5 @2xl:grid-cols-4">
      {actions.map((action) => (
        <QuickActionButton key={action.to} {...action} />
      ))}
    </div>
  </section>
);
