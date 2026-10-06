// The cards a viewer can drag, resize and reorder. That now includes the three blocks that used to
// be pinned at the top (Today, Needs approval, Key numbers): they start at the top, full width, but
// are the viewer's to move, shrink to half width, or leave where they are.
export type DashboardCardId =
  | 'todayStrip'
  | 'needsApproval'
  | 'kpiStrip'
  | 'myScores'
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
export const LAYOUT_VERSION = 3;

/** Cards added in version 3. A saved older layout gets these put at the FRONT (where they used to be
 *  pinned), not appended at the end like other new cards, so nobody's approvals block vanishes to
 *  the bottom of the page the day this ships. */
export const NEW_IN_V3: readonly DashboardCardId[] = ['todayStrip', 'needsApproval', 'kpiStrip'];

/** The dashboard's default layout — the starting point every user's saved layout is built from, and
 *  what "Reset to default" restores. Quick actions only repeat the sidebar links, so it sits last,
 *  below the fold. */
export const DEFAULT_CARD_ORDER: readonly DashboardCardId[] = [
  'todayStrip',
  'needsApproval',
  'kpiStrip',
  'myScores',
  'delegationScore',
  'activityOverview',
  'compareDashboard',
  'teamProgress',
  'compliance',
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
  // The three worklist blocks are wide by nature, so they start full width.
  todayStrip: 'big',
  needsApproval: 'big',
  kpiStrip: 'big',
  myScores: 'big',
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
  todayStrip: 'Today',
  needsApproval: 'Needs your approval',
  kpiStrip: 'Key numbers',
  myScores: 'Scores',
  quickActions: 'Quick actions',
  activityOverview: 'Activity overview',
  compliance: 'Compliance',
  delegationScore: 'Delegation score',
  compareDashboard: 'Compare dashboard',
  teamProgress: "Team's progress",
  recentActivity: 'Recently created',
  upcomingEvents: 'Upcoming events',
};
