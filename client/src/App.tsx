import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { FolderKanban, ClipboardCheck } from 'lucide-react';
import { ComingSoon } from './components/comingSoon';
import { useAuth } from './context/AuthContext';
import { ADMIN_AREA_ROLES, type Role } from './api/auth';
import { Dashboard } from './features/dashboard';
import { PublicLayout } from './components/layout';
import { useTicketSocket } from './features/tickets/useTicketSocket';
import { useTaskSocket } from './features/tasks/useTaskSocket';
import { useChecklistSocket } from './features/checklist/useChecklistSocket';
// Imported directly (not via features/checklist's barrel) so mounting it here doesn't drag the
// whole checklist feature — Builder, Compliance Board, etc — into the main entry chunk; those stay
// behind their own lazy() route imports below.
import { useNotificationSocket } from './features/notifications/useNotificationSocket';
import { MyErrorBoundary, NotFoundPage, MaintenancePage } from './components/error';
import { RouteFallback } from './components/skeleton';

// Maintenance flags/queries now live in lib/maintenance.ts — this whole-app build-time one, the
// per-page list the Dashboard shell checks, and the runtime admin-toggled one below. Reading the
// env var in two places would let them drift.
import { MAINTENANCE_ALL, usePublicSettingsQuery } from './lib/maintenance';

// Lazy like every other route. It was the one eager import among them, so its whole admin shell
// — nav tree, header, breadcrumbs — was downloaded by every user on first paint, including the
// large majority who are not ADMIN and can never reach a route inside it.
const AdminLayout = lazy(() => import('./features/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
// The three auth forms were the other eager imports. Between them they pull react-hook-form,
// @hookform/resolvers and the whole of zod (via features/auth/Schemas) into the entry chunk, so
// every already-signed-in user downloaded a login screen they will never see again before first
// paint. Lazy, they load only on the one navigation that actually needs them.
const ForcePasswordChange = lazy(() => import('./features/auth/ForcePasswordChange').then(m => ({ default: m.ForcePasswordChange })));
const LoginForm = lazy(() => import('./features/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const ForgotPasswordForm = lazy(() => import('./features/auth/ForgotPasswordForm').then(m => ({ default: m.ForgotPasswordForm })));
const ResetPasswordForm = lazy(() => import('./features/auth/ResetPasswordForm').then(m => ({ default: m.ResetPasswordForm })));
const HomePage = lazy(() => import('./features/dashboard/HomePage').then(m => ({ default: m.HomePage })));
const TicketList = lazy(() => import('./features/tickets/TicketList').then(m => ({ default: m.TicketList})));
const TaskList = lazy(() => import('./features/tasks/TaskList').then(m => ({ default: m.TaskList })));
const DraftDelegationsPage = lazy(() => import('./features/tasks/DraftAndArchivedTasks').then(m => ({ default: m.DraftDelegationsPage })));
const ArchivedDelegationsPage = lazy(() => import('./features/tasks/DraftAndArchivedTasks').then(m => ({ default: m.ArchivedDelegationsPage })));
const TodoPage = lazy(() => import('./features/todo/TodoPage').then(m => ({ default: m.TodoPage })));
const EventList = lazy(() => import('./features/events/EventList').then(m => ({ default: m.EventList })));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then(m => ({ default: m.CalendarPage })));
const OrgOverview = lazy(() => import('./features/admin/analytics').then(m => ({ default: m.OrgOverview })));
const VerificationQueue = lazy(() => import('./features/verification').then(m => ({ default: m.VerificationQueue })));
const AdminTaskList = lazy(() => import('./features/admin/AdminTaskList').then(m => ({ default: m.AdminTaskList })));
const TeamOverviewPage = lazy(() => import('./features/team/TeamOverviewPage').then(m => ({ default: m.TeamOverviewPage })));
const SettingsLayout = lazy(() => import('./features/settings/SettingsLayout').then(m => ({ default: m.SettingsLayout })));
const CategoryList = lazy(() => import('./features/settings/CategoryList').then(m => ({ default: m.CategoryList })));
const AccountSettings = lazy(() => import('./features/settings/AccountSettings').then(m => ({ default: m.AccountSettings })));
const AppearanceSettings = lazy(() => import('./features/settings/AppearanceSettings').then(m => ({ default: m.AppearanceSettings })));
const DirectoryPage = lazy(() => import('./features/admin/directory').then(m => ({ default: m.DirectoryPage })));
const OrgStructurePage = lazy(() => import('./features/admin/orgStructure').then(m => ({ default: m.OrgStructurePage })));
const ReportsPage = lazy(() => import('./features/reports').then(m => ({ default: m.ReportsPage })));
const FormerPeoplePage = lazy(() => import('./features/checklist/former').then(m => ({ default: m.FormerPeoplePage })));
const SystemHealthPage = lazy(() => import('./features/admin/health').then(m => ({ default: m.SystemHealthPage })));
const AuditLogPage = lazy(() => import('./features/admin/auditLog').then(m => ({ default: m.AuditLogPage })));
const HolidaysPage = lazy(() => import('./features/admin/holidays').then(m => ({ default: m.HolidaysPage })));
const PresenceOverview = lazy(() => import('./features/admin/presence').then(m => ({ default: m.PresenceOverview })));
const SettingsPage = lazy(() => import('./features/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ChecklistTemplateList = lazy(() => import('./features/admin/checklistTemplate').then(m => ({ default: m.ChecklistTemplateList })));
const MyChecklists = lazy(() => import('./features/checklist').then(m => ({ default: m.MyChecklists })));
const ChecklistInstanceDetail = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistInstanceDetail })));
const ChecklistTemplatesGrid = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistTemplatesGrid })));
const ChecklistDefinitionDetail = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistDefinitionDetail })));
const ChecklistBuilder = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistBuilder })));
const ChecklistComplianceBoard = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistComplianceBoard })));
const ChecklistApprovals = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistApprovals })));
const ChecklistHistory = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistHistory })));
const ChecklistWeeklyReport = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistWeeklyReport })));

const ProtectedRoute = () => {
  const { token, user } = useAuth();
  // Same admin exemption as the per-page maintenance check in Dashboard.tsx: whoever flipped this
  // on is the person who needs to get back in to flip it off again.
  const { data: maintenance } = usePublicSettingsQuery();
  if (!token) return <Navigate to="/login" replace />;
  // An admin set this password, so it is temporary: nothing else loads until they choose their own.
  if (user?.mustChangePassword) return <Suspense fallback={null}><ForcePasswordChange /></Suspense>;
  if (maintenance?.maintenanceMode && user?.role !== 'ADMIN') {
    return <MaintenancePage message={maintenance.maintenanceMessage ?? undefined} />;
  }
  return (
    <>
      <Outlet />
    </>
  );
};

// Same destination logic as useLoginMutation's own onSuccess redirect (features/auth/hooks.ts) —
// this used to always send an already-authenticated visitor to '/', so an ADMIN/PC who reopened
// /login (bookmark, back button, stale tab) landed somewhere different than a fresh login would
// have sent them, for the exact same account.
const AuthRoute = () => {
  const { token, user } = useAuth();
  if (!token) return <Outlet />;
  return <Navigate to={user && ADMIN_AREA_ROLES.includes(user.role) ? '/admin' : '/'} replace />;
};


// One factory instead of five hand-rolled "if (!token) redirect; if role not allowed, redirect;
// else Outlet" components below, each repeating the same two checks against its own separately
// hand-typed role set. That repetition is what let a guard's allowed roles silently drift from
// ADMIN_AREA_ROLES (the post-login redirect's own role set, in features/auth/hooks.ts) with
// nothing to catch it — a role added to one but not the other means either a login that
// "succeeds" but immediately bounces back out of /admin, or a role that's guard-eligible here but
// never actually routed there on login.
const createRoleGuard = (...roles: Role[]) => () => {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return user && roles.includes(user.role) ? <Outlet /> : <Navigate to="/" replace />;
};

// Two separately-named guards, same underlying ADMIN-or-PC role set (kept in sync with the
// post-login redirect via ADMIN_AREA_ROLES) — each still named for what it gates at its own call
// site below, not collapsed into one shared element, since the route tree reads clearer with a
// guard named after its subtree.
const AdminRoute = createRoleGuard(...ADMIN_AREA_ROLES);
const PCRoute = createRoleGuard(...ADMIN_AREA_ROLES);

// Stricter than PCRoute/AdminRoute (both ADMIN-or-PC) — for the handful of pages that are
// ADMIN-only even within the admin/PC audience: Verification Queue and Team Overview used to be
// PC's job too (the removed comments here said as much), but access was deliberately narrowed to
// ADMIN alone.
const AdminOnlyRoute = createRoleGuard('ADMIN');

// Verification Queue specifically (not Team Overview, which stays under AdminOnlyRoute above).
// PC is the primary audience — verification is their whole job (see task/ticket/checklist
// service.ts's CAN_VERIFY_BY_ROLE) — and the sidebar has always linked PC here (Sidebar.tsx's
// adminNavItems), so excluding the role from the route itself was a dead link, not a deliberate
// narrowing. APPROVAL_MANAGER stays too: harmless now that the old separate final-approval stage
// is gone, but not worth stripping their access as a side effect of an unrelated workflow change.
const VerifyQueueRoute = createRoleGuard('ADMIN', 'PC', 'APPROVAL_MANAGER');

// The Admin section's landing page: ADMIN or PC, same as the rest of /admin/* under the outer
// AdminRoute — PC has the same org-wide server-side rights as ADMIN everywhere else in this
// section, and this page's own `canSeeStoresTab` gate (OrgOverview.tsx) has always treated PC as
// eligible; the route just hadn't been opened to match. Was ADMIN-only with PC redirected to
// /admin/directory instead — kept here as the one still-relevant fallback: any *other* role
// reaching this route (shouldn't normally happen, AdminRoute already screens for ADMIN/PC) lands
// on a real page rather than a dead end.
const AdminOverviewRoute = () => {
  const { user } = useAuth();
  return user && ADMIN_AREA_ROLES.includes(user.role) ? <OrgOverview /> : <Navigate to="/admin/directory" replace />;
};

const AnalyticsRoute = createRoleGuard('MANAGER', 'SENIOR');

// Department heads (HOD) — checklist verification is where a MANAGER or SENIOR gets an approval
// queue of their own: own-department instances only, enforced server-side too (isHod in
// checklistInstance.service.ts). SENIOR was added to MANAGER on request: a Senior is a department
// HOD as well, scoped to the department on their user record.
const ManagerRoute = createRoleGuard('MANAGER', 'SENIOR');

// Checklist History (past audits + checklists): ADMIN/PC see every store, MANAGER/SENIOR only their
// own department. Same split the API enforces, this just keeps everyone else off the page.
const HistoryRoute = createRoleGuard('ADMIN', 'PC', 'MANAGER', 'SENIOR');

const ChecklistTemplatesRoute = () => {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') {
    return (
      <ComingSoon
        icon={ClipboardCheck}
        title="Checklist Templates"
        description="Checklist template management is being rolled out gradually and isn't available for your role yet."
        features={['Reusable delegation templates', 'Recurring schedule builder', 'Step-by-step template editor']}
      />
    );
  }
  return <ChecklistTemplateList />;
};

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <MyErrorBoundary />,
    children: [
      {
        // Suspense sits above AuthRoute's Outlet because PublicLayout has none of its own and the
        // three forms below are now lazy — same reason AdminLayout's route carries one.
        element: (
          <Suspense fallback={<RouteFallback />}>
            <AuthRoute />
          </Suspense>
        ),
        children: [
          { path: '/login', element: <LoginForm /> },
          { path: '/forgot-password', element: <ForgotPasswordForm /> },
          { path: '/reset-password', element: <ResetPasswordForm /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <MyErrorBoundary />,
    children: [
      {
        element: <Dashboard />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            path: '/projects',
            element: (
              <ComingSoon
                icon={FolderKanban}
                title="Projects"
                description="A dedicated space to plan, track, and collaborate on multi-step work — beyond single delegations and tickets."
                features={['Milestones & timelines', 'Cross-team task grouping', 'Progress dashboards']}
              />
            ),
          },
          { path: '/calendar', element: <CalendarPage /> },
          {
            path: '/settings',
            element: <SettingsLayout/>,
            children : [
              { index : true, element : <Navigate to="/settings/account" replace />},
              { path : "account", element : <AccountSettings/>},
              { path : "appearance", element : <AppearanceSettings/>},
              { path : "categories", element : <CategoryList/>}

          ] },
          { path: '/tickets', element: <TicketList /> },
          { path: '/tasks', element: <TaskList /> },
          {
            path: '/tasks/smart',
            // Locked to the "delegation" bucket — CATEGORY_PREDICATES already defines that as
            // "delegation category AND aiMeta present" (i.e. actually created through the AI:
            // Smart Add on the web, or the WhatsApp bot), not just every delegation. Same
            // TaskQuickStats/board/table/timeline views as the main Delegation page, just scoped.
            element: (
              <TaskList
                lockCategory="delegation"
                title="Smart Delegations"
                emptyTitle="No smart delegations yet"
                emptyDescription="Delegations created through the AI — Smart Add on the web, or the WhatsApp bot — will show up here."
              />
            ),
          },
          { path: '/tasks/draft', element: <DraftDelegationsPage /> },
          { path: '/tasks/archived', element: <ArchivedDelegationsPage /> },
          { path: '/todo', element: <TodoPage /> },
          { path: '/events', element: <EventList /> },
          { path: '/checklists', element: <MyChecklists /> },
          { path: '/checklists/:instanceId', element: <ChecklistInstanceDetail /> },
          { path: '/dashboard', element: <Navigate to="/" replace /> },
          {
            element: <ManagerRoute />,
            children: [
              { path: '/checklists/approvals', element: <ChecklistApprovals /> },
            ],
          },
          {
            element: <HistoryRoute />,
            children: [
              { path: '/checklists/history', element: <ChecklistHistory /> },
              { path: '/checklists/weekly', element: <ChecklistWeeklyReport /> },
            ],
          },
          {
            element: <AnalyticsRoute />,
            children: [
              { path: '/analytics', element: <OrgOverview /> },
            ],
          },
          {
            element: <PCRoute />,
            children: [
              // Org-wide task browser (department/person/day/status filters) — PC and ADMIN
              // both need this, so it lives here instead of under AdminRoute/AdminLayout,
              // which is gated to ADMIN only.
              { path: '/tasks/team', element: <AdminTaskList /> },
            ],
          },
          {
            // ADMIN-only — see AdminOnlyRoute's comment above for why this was narrowed from
            // PC-or-ADMIN.
            element: <AdminOnlyRoute />,
            children: [
              { path: '/team', element: <TeamOverviewPage /> },
            ],
          },
          {
            element: <VerifyQueueRoute />,
            children: [
              { path: '/verify', element: <VerificationQueue /> },
            ],
          },
        ],
      },
      {
        element: <AdminRoute />,
        children: [
          {
            // Its own boundary: App has no Suspense of its own — every other lazy route resolves
            // inside Dashboard's or AdminLayout's — so a lazy layout route needs one above it.
            element: (
              <Suspense fallback={<RouteFallback />}>
                <AdminLayout />
              </Suspense>
            ),
            children: [
              { path: '/admin', element: <AdminOverviewRoute /> },
              { path: '/admin/analytics', element: <Navigate to="/admin" replace /> },    
              { path: '/admin/reports/tasks', element: <Navigate to="/tasks/team" replace /> },
              { path: '/admin/directory', element: <DirectoryPage /> },
              { path: '/admin/users', element: <Navigate to="/admin/directory" replace /> },
              { path: '/admin/departments', element: <Navigate to="/admin/directory" replace /> },
              { path: '/admin/stores', element: <Navigate to="/admin/directory" replace /> },
              { path: '/admin/org-structure', element: <OrgStructurePage /> },
              { path: '/admin/checklist-templates', element: <ChecklistTemplatesRoute /> },
              { path: '/admin/scheduled-checklists', element: <ChecklistTemplatesGrid /> },
              { path: '/admin/checklist-compliance', element: <ChecklistComplianceBoard /> },
              { path: '/admin/scheduled-checklists/builder', element: <ChecklistBuilder /> },
              { path: '/admin/scheduled-checklists/builder/:definitionId', element: <ChecklistBuilder /> },
              { path: '/admin/scheduled-checklists/:definitionId', element: <ChecklistDefinitionDetail /> },
              { path: '/admin/tickets', element: <TicketList /> },
              { path: '/admin/reports', element: <ReportsPage /> },
              { path: '/admin/audit-log', element: <AuditLogPage /> },
              { path: '/admin/system-health', element: <SystemHealthPage /> },
              { path: '/admin/holidays', element: <HolidaysPage /> },
              { path: '/admin/checklist-former', element: <FormerPeoplePage /> },
              { path: '/admin/checklist-weekly', element: <ChecklistWeeklyReport /> },
              { path: '/admin/presence', element: <PresenceOverview /> },
              { path: '/admin/settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  useTicketSocket();
  useTaskSocket();
  useChecklistSocket();
  useNotificationSocket();

  if (MAINTENANCE_ALL) return <MaintenancePage />;

  return <RouterProvider router={router} />;
}
  