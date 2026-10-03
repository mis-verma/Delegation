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
  /** Defaults suit the user Dashboard, the only caller today. Override
   *  only if a third caller needs different copy. */
  title?: string;
  description?: string;
}

// A plain component, not a fixed action list: the caller passes its own `actions`, so the same shell
// (icon tile, header, action tiles) can be reused. The admin Overview dropped it because the
// sidebar already links to every one of those pages.
// Header/shell matches every other Dashboard card's shared convention (RecentActivity,
// UpcomingEvents: DASHBOARD_CARD_CLASS + the same px-4 sm:px-5 py-4 border-b/backdrop-blur-xl
// header band).
//
// The tiles are a wrapping row that grows, not a fixed-column grid. This card can render at very
// different widths (half the page beside Activity Overview on the user Dashboard, or full width) and a column count tuned for one crammed or stranded tiles at the other (4
// columns in the half-width case left each tile ~180px, and the fifth sat alone on its own row).
// With a minimum tile width instead, the card fits as many as it honestly can per row and lets the
// last row's tiles grow into the leftover space, so there's never a stray gap. The list is also
// the card's flex-1 body: beside a taller neighbour its rows stretch to fill the card rather than
// leaving an empty band under the tiles.
export const QuickActionsGrid = ({ actions, title = 'Quick actions', description = 'Jump straight to the tools you use most' }: QuickActionsGridProps) => (
  <section className={`relative flex flex-col overflow-hidden ${DASHBOARD_CARD_CLASS}`}>
    {/* Decorative glow, matching RecentActivity's panel language */}
    <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl" />

    <div className="relative z-10 flex items-center gap-3.5 border-b border-border/40 bg-surface/50 px-4 sm:px-5 py-4 backdrop-blur-xl">
      <EntityIconTile icon={Zap} tone="coral" />
      <div>
        <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-text">{title}</h2>
        <p className="mt-0.5 font-display text-[11px] sm:text-xs font-medium text-text-muted">{description}</p>
      </div>
    </div>

    <ul className="relative z-10 flex flex-1 flex-wrap gap-3 p-4 sm:gap-3.5 sm:p-5">
      {actions.map((action) => (
        <li key={action.to} className="flex grow basis-56">
          <QuickActionButton {...action} />
        </li>
      ))}
    </ul>
  </section>
);
