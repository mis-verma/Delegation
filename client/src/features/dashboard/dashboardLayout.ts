export type DashboardCardId =
  | 'quickActions'
  | 'activityOverview'
  | 'needsApproval'
  | 'compliance'
  | 'delegationScore'
  | 'compareDashboard'
  | 'teamProgress'
  | 'recentActivity'
  | 'upcomingEvents';

export type DashboardCardSize = 'small' | 'big';

/** The dashboard's fixed layout, in its original order — the starting point every user's saved
 *  layout is built from, and what "Reset to default" restores. */
export const DEFAULT_CARD_ORDER: readonly DashboardCardId[] = [
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

/** Compliance, Compare Dashboard, and Needs your approval are org-wide oversight widgets —
 *  ADMIN/PC only, same gate HomePage already applies to them. Kept here too so the layout hook
 *  can filter a MANAGER/SENIOR/AGENT's own card list without HomePage having to reach back into
 *  layout internals. */
export const ADMIN_ONLY_CARDS: ReadonlySet<DashboardCardId> = new Set(['compliance', 'compareDashboard', 'needsApproval']);

/** Every card starts at half-width — nothing on the dashboard was full-width before this feature
 *  existed, so "small" (the default) reproduces today's layout exactly for anyone who never opens
 *  Customize. */
export const DEFAULT_CARD_SIZES: Record<DashboardCardId, DashboardCardSize> = {
  quickActions: 'small',
  activityOverview: 'small',
  needsApproval: 'small',
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
  needsApproval: 'Needs your approval',
  compliance: 'Compliance',
  delegationScore: 'Delegation score',
  compareDashboard: 'Compare dashboard',
  teamProgress: "Team's progress",
  recentActivity: 'Recent activity',
  upcomingEvents: 'Upcoming events',
};
