// The cards a viewer can drag, resize and reorder. The worklist blocks above them (Today, Needs
// approval, KPI strip) are fixed at the top of the page on purpose and are not part of this list:
// the things that need doing today should never be dragged below a chart.
export type DashboardCardId =
  | 'quickActions'
  | 'activityOverview'
  | 'compliance'
  | 'delegationScore'
  | 'compareDashboard'
  | 'teamProgress'
  | 'recentActivity'
  | 'upcomingEvents';

export type DashboardCardSize = 'small' | 'big';

/** Bump whenever DEFAULT_CARD_ORDER changes. A saved layout from an older version is migrated in
 *  useDashboardLayout: if it was just the old default, it moves to the new default; if the user had
 *  rearranged it, their order is kept. */
export const LAYOUT_VERSION = 2;

/** The dashboard's default layout — the starting point every user's saved layout is built from, and
 *  what "Reset to default" restores. Quick actions only repeat the sidebar links, so it sits last,
 *  below the fold. */
export const DEFAULT_CARD_ORDER: readonly DashboardCardId[] = [
  'delegationScore',
  'activityOverview',
  'compliance',
  'compareDashboard',
  'teamProgress',
  'recentActivity',
  'upcomingEvents',
  'quickActions',
];

/** The v1 default order, kept only so a saved layout that is still exactly the old default can be
 *  recognised (and moved to the new default) rather than treated as a deliberate custom order.
 *  'needsApproval' was a draggable card in v1; it is now a fixed block, so stored copies of that id
 *  are simply dropped. */
export const LEGACY_V1_DEFAULT_ORDER: readonly string[] = [
  'quickActions',
  'activityOverview',
  'needsApproval',
  'compliance',
  'delegationScore',
  'compareDashboard',
  'teamProgress',
  'recentActivity',
  'upcomingEvents',
];
export const LEGACY_V1_ADMIN_ONLY: ReadonlySet<string> = new Set(['compliance', 'compareDashboard', 'needsApproval']);

/** Compliance and Compare Dashboard are org-wide oversight widgets, ADMIN/PC only, the same gate
 *  HomePage applies to them. Kept here too so the layout hook can filter a MANAGER/SENIOR/AGENT's
 *  own card list without HomePage having to reach back into layout internals. */
export const ADMIN_ONLY_CARDS: ReadonlySet<DashboardCardId> = new Set(['compliance', 'compareDashboard']);

/** Every card starts at half-width. */
export const DEFAULT_CARD_SIZES: Record<DashboardCardId, DashboardCardSize> = {
  quickActions: 'small',
  activityOverview: 'small',
  compliance: 'small',
  delegationScore: 'small',
  compareDashboard: 'small',
  teamProgress: 'small',
  recentActivity: 'small',
  upcomingEvents: 'small',
};

/** Shown in the drag handle's accessible name and the customize-mode label strip — the same
 *  names these cards already carry as on-page headings. */
export const CARD_LABEL: Record<DashboardCardId, string> = {
  quickActions: 'Quick actions',
  activityOverview: 'Activity overview',
  compliance: 'Compliance',
  delegationScore: 'Delegation score',
  compareDashboard: 'Compare dashboard',
  teamProgress: "Team's progress",
  recentActivity: 'Recently created',
  upcomingEvents: 'Upcoming events',
};
