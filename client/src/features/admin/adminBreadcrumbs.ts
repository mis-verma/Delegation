import type { BreadcrumbTrailItem } from '../../components/breadcrumbs';

const DASHBOARD: BreadcrumbTrailItem = { label: 'Dashboard', to: '/' };
const ADMIN_ROOT: BreadcrumbTrailItem = { label: 'Admin', to: '/admin' };

const OWN_BREADCRUMB_PATTERNS = [
  /^\/admin\/scheduled-checklists\/builder(\/.+)?$/,
  /^\/admin\/scheduled-checklists\/[^/]+$/,
];

export function getAdminBreadcrumbs(pathname: string): BreadcrumbTrailItem[] | null {
  if (OWN_BREADCRUMB_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return null;
  }
  if (pathname === '/admin') {
    return [DASHBOARD, { label: 'Overview' }];
  }
  if (pathname.startsWith('/admin/scores')) {
    return [DASHBOARD, { label: 'Overview', to: '/admin' }, { label: 'Scores' }];
  }
  if (pathname.startsWith('/admin/data-check')) {
    return [DASHBOARD, { label: 'Overview', to: '/admin' }, { label: 'Scores', to: '/admin/scores' }, { label: 'Data check' }];
  }
  if (pathname.startsWith('/team/fill')) {
    return [DASHBOARD, { label: 'Overview', to: '/admin' }, { label: 'Fill Chart' }];
  }
  if (pathname === '/admin/scorecard') {
    return [DASHBOARD, { label: 'Overview', to: '/admin' }, { label: 'Scorecard' }];
  }
  if (pathname === '/admin/rankings') {
    return [DASHBOARD, { label: 'Overview', to: '/admin' }, { label: 'Rankings' }];
  }
  if (pathname.startsWith('/admin/scheduled-checklists')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Recurring Checklists' }];
  }
  if (pathname.startsWith('/admin/checklist-compliance')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Checklist Compliance' }];
  }
  if (pathname.startsWith('/admin/checklist-weekly')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Report' }];
  }
  if (pathname.startsWith('/admin/checklist-former')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Former People' }];
  }
  if (pathname.startsWith('/admin/system-health')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'System Health' }];
  }
  if (pathname.startsWith('/admin/holidays')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Holidays' }];
  }
  if (pathname.startsWith('/admin/dress-types')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Dress Types' }];
  }
  if (pathname.startsWith('/admin/checklist-templates')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Task Templates' }];
  }
  if (pathname.startsWith('/admin/tickets')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Tickets' }];
  }
  if (pathname.startsWith('/admin/directory')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'People & Teams' }];
  }
  if (pathname.startsWith('/admin/presence')) {
    return [DASHBOARD, ADMIN_ROOT, { label: "Who's Online" }];
  }
  if (pathname.startsWith('/admin/org-structure')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Org Structure' }];
  }
  if (pathname.startsWith('/admin/reports')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Reports' }];
  }
  if (pathname.startsWith('/admin/audit-log')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Audit Log' }];
  }
  if (pathname.startsWith('/admin/system-health')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'System Health' }];
  }
  if (pathname.startsWith('/admin/settings')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Settings' }];
  }
  return [DASHBOARD, ADMIN_ROOT];
}

export const TEAM_DELEGATIONS_BREADCRUMBS: BreadcrumbTrailItem[] = [
  DASHBOARD,
  ADMIN_ROOT,
  { label: 'Team Delegations' },
];
