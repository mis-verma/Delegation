import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router';
import { FolderKanban } from 'lucide-react';
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

import { MAINTENANCE_ALL, usePublicSettingsQuery } from './lib/maintenance';

const AdminLayout = lazy(() => import('./features/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const ForcePasswordChange = lazy(() => import('./features/auth/ForcePasswordChange').then(m => ({ default: m.ForcePasswordChange })));
const LoginForm = lazy(() => import('./features/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const ForgotPasswordForm = lazy(() => import('./features/auth/ForgotPasswordForm').then(m => ({ default: m.ForgotPasswordForm })));
const GetAppPage = lazy(() => import('./features/getApp').then(m => ({ default: m.GetAppPage })));
const ResetPasswordForm = lazy(() => import('./features/auth/ResetPasswordForm').then(m => ({ default: m.ResetPasswordForm })));
const HomePage = lazy(() => import('./features/dashboard/HomePage').then(m => ({ default: m.HomePage })));
const TicketList = lazy(() => import('./features/tickets/TicketList').then(m => ({ default: m.TicketList})));
const TaskList = lazy(() => import('./features/tasks/TaskList').then(m => ({ default: m.TaskList })));
const DraftDelegationsPage = lazy(() => import('./features/tasks/DraftAndArchivedTasks').then(m => ({ default: m.DraftDelegationsPage })));
const ArchivedDelegationsPage = lazy(() => import('./features/tasks/DraftAndArchivedTasks').then(m => ({ default: m.ArchivedDelegationsPage })));
const TodoPage = lazy(() => import('./features/todo/TodoPage').then(m => ({ default: m.TodoPage })));
const EventList = lazy(() => import('./features/events/EventList').then(m => ({ default: m.EventList })));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then(m => ({ default: m.CalendarPage })));
const ScoresPage = lazy(() => import('./features/scores').then(m => ({ default: m.ScoresPage })));
const FillHeatmapPage = lazy(() => import('./features/attention/FillHeatmapPage').then(m => ({ default: m.FillHeatmapPage })));
const DataCheckPage = lazy(() => import('./features/admin/dataCheck').then(m => ({ default: m.DataCheckPage })));
const ScorecardPage = lazy(() => import('./features/admin/analytics/ScorecardPage').then(m => ({ default: m.ScorecardPage })));
const OrgOverview = lazy(() => import('./features/admin/analytics').then(m => ({ default: m.OrgOverview })));
const VerificationQueue = lazy(() => import('./features/verification').then(m => ({ default: m.VerificationQueue })));
const AdminTaskList = lazy(() => import('./features/admin/AdminTaskList').then(m => ({ default: m.AdminTaskList })));
const SettingsLayout = lazy(() => import('./features/settings/SettingsLayout').then(m => ({ default: m.SettingsLayout })));
const CategoryList = lazy(() => import('./features/settings/CategoryList').then(m => ({ default: m.CategoryList })));
const AccountSettings = lazy(() => import('./features/settings/AccountSettings').then(m => ({ default: m.AccountSettings })));
const AppearanceSettings = lazy(() => import('./features/settings/AppearanceSettings').then(m => ({ default: m.AppearanceSettings })));
const DirectoryPage = lazy(() => import('./features/admin/directory').then(m => ({ default: m.DirectoryPage })));
const ReportsPage = lazy(() => import('./features/reports').then(m => ({ default: m.ReportsPage })));
const FormerPeoplePage = lazy(() => import('./features/checklist/former').then(m => ({ default: m.FormerPeoplePage })));
const SystemHealthPage = lazy(() => import('./features/admin/health').then(m => ({ default: m.SystemHealthPage })));
const AuditLogPage = lazy(() => import('./features/admin/auditLog').then(m => ({ default: m.AuditLogPage })));
const DressTypesPage = lazy(() => import('./features/admin/dressTypes').then(m => ({ default: m.DressTypesPage })));
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
  const { data: maintenance } = usePublicSettingsQuery();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword) return <Suspense fallback={null}><ForcePasswordChange /></Suspense>;
  if (maintenance?.maintenanceMode && !(user && ADMIN_AREA_ROLES.includes(user.role))) {
    return <MaintenancePage message={maintenance.maintenanceMessage ?? undefined} />;
  }
  return (
    <>
      <Outlet />
    </>
  );
};

const AuthRoute = () => {
  const { token, user } = useAuth();
  if (!token) return <Outlet />;
  return <Navigate to={user && ADMIN_AREA_ROLES.includes(user.role) ? '/admin' : '/'} replace />;
};

const createRoleGuard = (...roles: Role[]) => () => {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return user && roles.includes(user.role) ? <Outlet /> : <Navigate to="/" replace />;
};

const AdminRoute = createRoleGuard(...ADMIN_AREA_ROLES);
const PCRoute = createRoleGuard(...ADMIN_AREA_ROLES);

const AdminOnlyRoute = createRoleGuard('ADMIN');

const VerifyQueueRoute = createRoleGuard('ADMIN', 'PC', 'APPROVAL_MANAGER');

const AdminOverviewRoute = () => {
  const { user } = useAuth();
  return user && ADMIN_AREA_ROLES.includes(user.role) ? <OrgOverview /> : <Navigate to="/admin/directory" replace />;
};

const AnalyticsRoute = createRoleGuard('MANAGER', 'SENIOR');

const ScoresLayout = () => {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!user) return null;
  if (ADMIN_AREA_ROLES.includes(user.role)) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <AdminLayout />
      </Suspense>
    );
  }
  if (user.role === 'MANAGER' || user.role === 'SENIOR') return <Dashboard />;
  return <Navigate to="/" replace />;
};

const RedirectToScores = ({ set }: { set: Record<string, string> }) => {
  const { search } = useLocation();
  const next = new URLSearchParams(search);
  next.delete('by');
  for (const [key, value] of Object.entries(set)) next.set(key, value);
  return <Navigate to={`/admin/scores?${next.toString()}`} replace />;
};

const TeamRedirect = () => {
  const { search } = useLocation();
  const old = new URLSearchParams(search);
  const departmentId = old.get('departmentId');
  const personId = old.get('personId');
  const next = new URLSearchParams();
  const trail: { id: string; kind: 'department' | 'person'; name: string }[] = [];
  if (departmentId) trail.push({ id: departmentId, kind: 'department', name: '' });
  if (personId) trail.push({ id: personId, kind: 'person', name: '' });
  if (trail.length) next.set('trail', JSON.stringify(trail));
  next.set('view', personId ? 'checklist' : departmentId ? 'person' : 'department');
  return <Navigate to={`/admin/scores?${next.toString()}`} replace />;
};

const HistoryRoute = createRoleGuard('ADMIN', 'PC', 'MANAGER', 'SENIOR');

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <MyErrorBoundary />,
    children: [
      {
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
      { path: '/get-app', element: <Suspense fallback={<RouteFallback />}><GetAppPage /></Suspense> },
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
                description="A dedicated space to plan, track, and collaborate on multi-step work, beyond single delegations and tickets."
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
            element: (
              <TaskList
                lockCategory="delegation"
                title="Smart Delegations"
                emptyTitle="No smart delegations yet"
                emptyDescription="Delegations created through the AI (Smart Add on the web, or the WhatsApp bot) will show up here."
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
          { path: '/checklists/approvals', element: <ChecklistApprovals /> },
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
              { path: '/tasks/team', element: <AdminTaskList /> },
            ],
          },
          {
            element: <AdminOnlyRoute />,
            children: [
              { path: '/team', element: <TeamRedirect /> },
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
        path: '/admin/scores',
        element: <ScoresLayout />,
        children: [{ index: true, element: <ScoresPage /> }],
      },
      {
        path: '/team/fill',
        element: <ScoresLayout />,
        children: [{ index: true, element: <FillHeatmapPage /> }],
      },
      {
        element: <AdminRoute />,
        children: [
          {
            element: (
              <Suspense fallback={<RouteFallback />}>
                <AdminLayout />
              </Suspense>
            ),
            children: [
              { path: '/admin', element: <AdminOverviewRoute /> },
              { path: '/admin/rankings', element: <RedirectToScores set={{ view: 'department' }} /> },
              { path: '/admin/scorecard', element: <ScorecardPage /> },
              { path: '/admin/checklist-store-daily', element: <RedirectToScores set={{ view: 'store' }} /> },
              { path: '/admin/data-check', element: <DataCheckPage /> },
              { path: '/admin/analytics', element: <Navigate to="/admin" replace /> },    
              { path: '/admin/reports/tasks', element: <Navigate to="/tasks/team" replace /> },
              { path: '/admin/directory', element: <DirectoryPage /> },
              { path: '/admin/users', element: <Navigate to="/admin/directory" replace /> },
              { path: '/admin/departments', element: <Navigate to="/admin/directory" replace /> },
              { path: '/admin/stores', element: <Navigate to="/admin/directory" replace /> },
              { path: '/admin/org-structure', element: <Navigate to="/admin/directory?tab=structure" replace /> },
              { path: '/admin/checklist-templates', element: <ChecklistTemplateList /> },
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
              { path: '/admin/dress-types', element: <DressTypesPage /> },
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
  