import type { BreadcrumbTrailItem } from '../../components/breadcrumbs';

const DASHBOARD: BreadcrumbTrailItem = { label: 'Dashboard', to: '/' };
const ADMIN_ROOT: BreadcrumbTrailItem = { label: 'Admin', to: '/admin' };

// Pages that build their own breadcrumb (they know a dynamic name the route alone doesn't carry
// — a specific checklist's title, or the builder wizard's current step) opt out of this generic
// section trail entirely, rather than stacking two breadcrumb bars on top of each other.
const OWN_BREADCRUMB_PATTERNS = [
  /^\/admin\/scheduled-checklists\/builder(\/.+)?$/,
  /^\/admin\/scheduled-checklists\/[^/]+$/,
];

/** Section-level breadcrumb trail for an admin route, always rooted at the user's own dashboard
 *  so every admin page carries a one-click way back to it. Returns null when the destination page
 *  renders a more specific breadcrumb of its own. */
export function getAdminBreadcrumbs(pathname: string): BreadcrumbTrailItem[] | null {
  if (OWN_BREADCRUMB_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return null;
  }
  if (pathname === '/admin') {
    return [DASHBOARD, { label: 'Overview' }];
  }
  if (pathname.startsWith('/admin/scheduled-checklists')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Checklists' }];
  }
  if (pathname.startsWith('/admin/checklist-compliance')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Checklist Compliance' }];
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
  if (pathname.startsWith('/admin/org-structure')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Org Structure' }];
  }
  if (pathname.startsWith('/admin/reports')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Reports' }];
  }
  if (pathname.startsWith('/admin/settings')) {
    return [DASHBOARD, ADMIN_ROOT, { label: 'Settings' }];
  }
  return [DASHBOARD, ADMIN_ROOT];
}

/** Same trail, for the "Team Delegations" page — it lives at /tasks/team under the regular
 *  Dashboard shell (not AdminLayout) but is reached only from the admin nav, so it gets the same
 *  Dashboard -> Admin -> ... treatment for consistency. */
export const TEAM_DELEGATIONS_BREADCRUMBS: BreadcrumbTrailItem[] = [
  DASHBOARD,
  ADMIN_ROOT,
  { label: 'Team Delegations' },
];
