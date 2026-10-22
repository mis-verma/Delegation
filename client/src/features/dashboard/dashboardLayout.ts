export type DashboardCardId =
  | 'todayStrip'
  | 'ticketRequests'
  | 'needsApproval'
  | 'exceptions'
  | 'myTeam'
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

export const LAYOUT_VERSION = 12;

export const NEW_IN_V3: readonly DashboardCardId[] = ['todayStrip', 'needsApproval', 'kpiStrip'];

export const DEFAULT_CARD_ORDER: readonly DashboardCardId[] = [
  'todayStrip',
  'ticketRequests',
  'needsApproval',
  'exceptions',
  'myTeam',
  'kpiStrip',
  'myScores',
];

export const FRONT_LINE_CARD_ORDER: readonly DashboardCardId[] = [
  'kpiStrip',
  'myScores',
  'needsApproval',
];

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

export const ADMIN_ONLY_CARDS: ReadonlySet<DashboardCardId> = new Set(['compliance', 'compareDashboard']);

export const HOD_ONLY_CARDS: ReadonlySet<DashboardCardId> = new Set(['myTeam']);

export const REQUEST_REVIEWER_CARDS: ReadonlySet<DashboardCardId> = new Set(['ticketRequests']);

export const DEFAULT_CARD_SIZES: Record<DashboardCardId, DashboardCardSize> = {
  todayStrip: 'big',
  ticketRequests: 'big',
  needsApproval: 'small',
  exceptions: 'small',
  myTeam: 'big',
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

export const CARD_LABEL: Record<DashboardCardId, string> = {
  todayStrip: 'Today',
  ticketRequests: 'Ticket requests',
  needsApproval: 'Needs your approval',
  exceptions: 'Needs attention',
  myTeam: 'My team',
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
