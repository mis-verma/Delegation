export type DashboardCardId =
  | 'todayStrip'
  | 'ticketRequests'
  | 'needsApproval'
  | 'exceptions'
  | 'myTeam'
  | 'kpiStrip'
  | 'myScores'
  | 'teamHeat'
  | 'streak'
  | 'quickActions'
  | 'activityOverview'
  | 'compliance'
  | 'delegationScore'
  | 'compareDashboard'
  | 'teamProgress'
  | 'recentActivity'
  | 'upcomingEvents';

export type DashboardCardSize = 'small' | 'big';

export const LAYOUT_VERSION = 16;

export const NEW_IN_V3: readonly DashboardCardId[] = ['todayStrip', 'needsApproval', 'kpiStrip'];

export const LEGACY_V12_DEFAULT_ORDER: readonly DashboardCardId[] = [
  'todayStrip',
  'ticketRequests',
  'needsApproval',
  'exceptions',
  'myTeam',
  'kpiStrip',
  'myScores',
];

export const LEGACY_V13_DEFAULT_ORDER: readonly DashboardCardId[] = [
  'todayStrip',
  'kpiStrip',
  'exceptions',
  'needsApproval',
  'ticketRequests',
  'myTeam',
  'myScores',
];

export const LEGACY_V14_DEFAULT_ORDER: readonly DashboardCardId[] = [
  'todayStrip',
  'kpiStrip',
  'teamHeat',
  'exceptions',
  'needsApproval',
  'ticketRequests',
  'myTeam',
  'myScores',
];

export const DEFAULT_CARD_ORDER: readonly DashboardCardId[] = [
  'todayStrip',
  'kpiStrip',
  'streak',
  'teamHeat',
  'exceptions',
  'needsApproval',
  'ticketRequests',
  'myTeam',
  'myScores',
];

export const FRONT_LINE_CARD_ORDER: readonly DashboardCardId[] = [
  'kpiStrip',
  'streak',
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

export const TEAM_VIEW_CARDS: ReadonlySet<DashboardCardId> = new Set(['teamHeat']);

export const HOD_ONLY_CARDS: ReadonlySet<DashboardCardId> = new Set(['myTeam']);

export const HOD_HIDDEN_CARDS: ReadonlySet<DashboardCardId> = new Set(['needsApproval', 'myScores']);

export const REQUEST_REVIEWER_CARDS: ReadonlySet<DashboardCardId> = new Set(['ticketRequests']);

export const DEFAULT_CARD_SIZES: Record<DashboardCardId, DashboardCardSize> = {
  todayStrip: 'big',
  ticketRequests: 'big',
  needsApproval: 'small',
  exceptions: 'small',
  myTeam: 'big',
  kpiStrip: 'big',
  myScores: 'big',
  teamHeat: 'big',
  streak: 'big',
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
  ticketRequests: 'Requests',
  needsApproval: 'Needs your approval',
  exceptions: 'Needs attention',
  myTeam: 'My team',
  kpiStrip: 'Key numbers',
  myScores: 'Scores',
  teamHeat: 'Team this week',
  streak: 'Checklist streak',
  quickActions: 'Quick actions',
  activityOverview: 'Activity overview',
  compliance: 'Compliance',
  delegationScore: 'Delegation score',
  compareDashboard: 'Compare dashboard',
  teamProgress: "Team's progress",
  recentActivity: 'Recently created',
  upcomingEvents: 'Upcoming events',
};
