import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { FolderKanban, Calendar, ClipboardCheck } from 'lucide-react';
import { ComingSoon } from './components/comingSoon';
import { useAuth } from './context/AuthContext';
import { ADMIN_AREA_ROLES, type Role } from './api/auth';
import { Dashboard } from './features/dashboard';
import { PublicLayout } from './components/layout';
import { useTicketSocket } from './features/tickets/useTicketSocket';
import { useTaskSocket } from './features/tasks/useTaskSocket';
import { useChecklistSocket } from './features/checklist/useChecklistSocket';
import { useNotificationSocket } from './features/notifications/useNotificationSocket';
import { MyErrorBoundary, NotFoundPage, MaintenancePage } from './components/error';
import { RouteFallback } from './components/skeleton';

// Both maintenance flags now live in lib/maintenance.ts — this whole-app one, and the per-page
// list the Dashboard shell checks. Reading the env var in two places would let them drift.
import { MAINTENANCE_ALL } from './lib/maintenance';

// Lazy like every other route. It was the one eager import among them, so its whole admin shell
// — nav tree, header, breadcrumbs — was downloaded by every user on first paint, including the
// large majority who are not ADMIN and can never reach a route inside it.
const AdminLayout = lazy(() => import('./features/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
// The three auth forms were the other eager imports. Between them they pull react-hook-form,
// @hookform/resolvers and the whole of zod (via features/auth/Schemas) into the entry chunk, so
// every already-signed-in user downloaded a login screen they will never see again before first
// paint. Lazy, they load only on the one navigation that actually needs them.
const LoginForm = lazy(() => import('./features/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const ForgotPasswordForm = lazy(() => import('./features/auth/ForgotPasswordForm').then(m => ({ default: m.ForgotPasswordForm })));
const ResetPasswordForm = lazy(() => import('./features/auth/ResetPasswordForm').then(m => ({ default: m.ResetPasswordForm })));
const HomePage = lazy(() => import('./features/dashboard/HomePage').then(m => ({ default: m.HomePage })));
const TicketList = lazy(() => import('./features/tickets/TicketList').then(m => ({ default: m.TicketList})));
const TaskList = lazy(() => import('./features/tasks/TaskList').then(m => ({ default: m.TaskList })));
const TodoPage = lazy(() => import('./features/todo/TodoPage').then(m => ({ default: m.TodoPage })));
const EventList = lazy(() => import('./features/events/EventList').then(m => ({ default: m.EventList })));
const OrgOverview = lazy(() => import('./features/admin/analytics').then(m => ({ default: m.OrgOverview })));
const VerificationQueue = lazy(() => import('./features/verification').then(m => ({ default: m.VerificationQueue })));
const AdminTaskList = lazy(() => import('./features/admin/AdminTaskList').then(m => ({ default: m.AdminTaskList })));
const TeamOverviewPage = lazy(() => import('./features/team/TeamOverviewPage').then(m => ({ default: m.TeamOverviewPage })));
const SettingsLayout = lazy(() => import('./features/settings/SettingsLayout').then(m => ({ default: m.SettingsLayout })));
const CategoryList = lazy(() => import('./features/settings/CategoryList').then(m => ({ default: m.CategoryList })));
const DirectoryPage = lazy(() => import('./features/admin/directory').then(m => ({ default: m.DirectoryPage })));
const OrgStructurePage = lazy(() => import('./features/admin/orgStructure').then(m => ({ default: m.OrgStructurePage })));
const ReportsPage = lazy(() => import('./features/reports').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./features/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ChecklistTemplateList = lazy(() => import('./features/admin/checklistTemplate').then(m => ({ default: m.ChecklistTemplateList })));
const MyChecklists = lazy(() => import('./features/checklist').then(m => ({ default: m.MyChecklists })));
const ChecklistInstanceDetail = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistInstanceDetail })));
const ChecklistTemplatesGrid = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistTemplatesGrid })));
const ChecklistDefinitionDetail = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistDefinitionDetail })));
const ChecklistBuilder = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistBuilder })));
const ChecklistComplianceBoard = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistComplianceBoard })));
const ChecklistApprovals = lazy(() => import('./features/checklist').then(m => ({ default: m.ChecklistApprovals })));

const ProtectedRoute = () => {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
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

// The Admin section's landing page specifically is ADMIN-only, while the rest of /admin/* (
// Directory, Org Structure, Checklists, Reports, Settings, etc.) stays open to PC under the outer
// AdminRoute — same "one page inside a looser-gated section needs its own stricter check" pattern
// ChecklistTemplatesRoute already uses below. A PC landing on /admin gets sent to the first page
// they actually have, not a dead end.
const AdminOverviewRoute = () => {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <OrgOverview /> : <Navigate to="/admin/directory" replace />;
};

const AnalyticsRoute = createRoleGuard('MANAGER', 'SENIOR');

// HOD-only — checklist verification is the one place a MANAGER gets an approval queue of their
// own (own-department instances, enforced server-side too). Deliberately narrower than
// AnalyticsRoute (MANAGER-or-SENIOR): a SENIOR oversees a whole store across departments, not one
// department's checklist compliance, so this stays MANAGER-only per the requested flow.
const ManagerRoute = createRoleGuard('MANAGER');

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
          {
            path: '/calendar',
            element: (
              <ComingSoon
                icon={Calendar}
                title="Calendar"
                description="A unified calendar view of every delegation, ticket, and checklist due date across your team."
                features={['Day, week & month views', 'Drag-to-reschedule due dates', 'Team availability at a glance']}
              />
            ),
          },
          { 
            path: '/settings', 
            element: <SettingsLayout/>, 
            children : [
              { index : true, element : <Navigate to="/settings/categories" replace />},
              { path : "categories", element : <CategoryList/>}

          ] },
          { path: '/tickets', element: <TicketList /> },
          { path: '/tasks', element: <TaskList /> },
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
            // ADMIN-only — see AdminOnlyRoute's comment above for why these two were narrowed
            // from PC-or-ADMIN.
            element: <AdminOnlyRoute />,
            children: [
              { path: '/verify', element: <VerificationQueue /> },
              { path: '/team', element: <TeamOverviewPage /> },
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
  