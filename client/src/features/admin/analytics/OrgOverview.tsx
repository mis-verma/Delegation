import { memo, useCallback, useId } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { AlertTriangle, ClipboardCheck, FileDown, Info, Repeat, TicketCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button, InlineError, NoticeBanner } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { useUsersQuery } from '../hook';
import { AnalyticsControlBar, type GroupBy } from './GroupByControl';
import { useAnalyticsWindow, useSearchPatch } from './useAnalyticsWindow';
import { TaskChecklistKpiSection } from './TaskChecklistKpiSection';
import { TicketKpiSection } from './TicketKpiSection';
import { ChecklistInstanceKpiSection } from './ChecklistInstanceKpiSection';
import { AnalyticsSummaryStrip } from './AnalyticsSummaryStrip';
import { OrgSnapshotStrip } from './OrgSnapshotStrip';
import { PerformanceLeadersCard } from './PerformanceLeadersCard';
import { TeamLeaderboardRail } from './TeamLeaderboardRail';
import { useAnalyticsRefresh, useRecentActivityFeed } from './useAnalyticsQueries';
import { RecentActivity } from '../../dashboard/RecentActivity';
import type { Department } from '../../../api/departments';
import type { Store } from '../../../api/stores';
import type { AdminUser } from '../../../api/admin';

const SECTION_TABS = [
  { value: 'delegations', label: 'Delegations', icon: ClipboardCheck },
  { value: 'store-checklists', label: 'Store checklists', icon: Repeat },
  { value: 'tickets', label: 'Tickets', icon: TicketCheck },
] as const;

type SectionValue = (typeof SECTION_TABS)[number]['value'];

const DEFAULT_SECTION: SectionValue = 'delegations';
const SECTIONS_ANCHOR_ID = 'overview-sections';

const EMPTY_STORES: Store[] = [];
const EMPTY_DEPARTMENTS: Department[] = [];
const EMPTY_USERS: AdminUser[] = [];

// Comparing performance across stores and departments is an org-wide (owner) view: a department
// head only needs their own numbers, not a cross-entity ranking. It also depends on the
// ADMIN/PC-only /users list, which is not opened up further here.
const isOrgWide = (role?: string) => role === 'ADMIN' || role === 'PC';

// ---------------------------------------------------------------------------------------------
// Scope notice (MANAGER and SENIOR only)
// ---------------------------------------------------------------------------------------------

interface ScopeNoticeProps {
  role?: string;
  departmentId?: string | null;
  storeId?: string | null;
  departments?: Department[];
  stores?: Store[];
  /** Names still loading, or the lookup failed: say nothing rather than guess. */
  isUnavailable: boolean;
}

// Department heads see only their own slice of the organisation. Said once, up front, instead of a
// chip beside the title. Renders nothing while the names are still loading, so it never flashes
// "unassigned" before the real department or store arrives.
const ScopeNotice = memo(({ role, departmentId, storeId, departments, stores, isUnavailable }: ScopeNoticeProps) => {
  if (role !== 'MANAGER' && role !== 'SENIOR') return null;
  if (isUnavailable) return null;

  const department = departments?.find((d) => d.id === departmentId);
  const store = stores?.find((s) => s.id === storeId);

  if (role === 'MANAGER' && !department) {
    return (
      <NoticeBanner tone="warning" icon={AlertTriangle}>
        No department is assigned to your account, so there are no numbers to show yet. Ask an admin to set one.
      </NoticeBanner>
    );
  }
  // The server returns no rows at all for a SENIOR missing either one, so say which is missing.
  if (role === 'SENIOR' && (!storeId || !departmentId)) {
    const missing = !storeId && !departmentId ? 'store or department' : !storeId ? 'store' : 'department';
    return (
      <NoticeBanner tone="warning" icon={AlertTriangle}>
        No {missing} is assigned to your account, so there are no numbers to show yet. Ask an admin to set one.
      </NoticeBanner>
    );
  }

  return (
    <NoticeBanner tone="info" icon={Info}>
      {role === 'MANAGER'
        ? `You are seeing numbers for the ${department?.name} department only.`
        : `You are seeing tickets and delegations for ${store?.name ?? 'your store'}, and checklists for the ${department?.name ?? 'your'} department.`}
    </NoticeBanner>
  );
});
ScopeNotice.displayName = 'ScopeNotice';

// ---------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------

interface OverviewTabsProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  isOrgWideRole: boolean;
}

// Owns the selected tab, so switching tabs re-renders only this block and never the summary or
// snapshot strips above and below it.
const OverviewTabs = memo(({ groupBy, from, to, isOrgWideRole }: OverviewTabsProps) => {
  const headingId = useId();
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const tabs = SECTION_TABS;
  const requested = params.get('tab');
  const section: SectionValue = tabs.find((t) => t.value === requested)?.value ?? DEFAULT_SECTION;

  return (
    <section id={SECTIONS_ANCHOR_ID} aria-labelledby={headingId} className="flex flex-col gap-4 scroll-mt-4 lg:scroll-mt-44">
      <h2 id={headingId} className="sr-only">Performance by area</h2>
      <Tabs value={section} onValueChange={(v) => patch({ tab: v === DEFAULT_SECTION ? null : v })}>
        {/* Four equal columns on a phone: the icon drops out and a long label wraps to two lines
            instead of clipping. A compact pill group from sm up. */}
        <TabsList aria-label="Performance area" className="grid w-full grid-flow-col auto-cols-fr sm:inline-flex sm:w-fit h-auto">
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 sm:min-h-9 px-1.5 sm:px-4 text-xs sm:text-sm text-center leading-tight whitespace-normal sm:whitespace-nowrap"
            >
              <Icon size={16} aria-hidden="true" className="hidden sm:block" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="delegations" className="pt-4 sm:pt-6">
          <TaskChecklistKpiSection groupBy={groupBy} from={from} to={to} isOrgWideRole={isOrgWideRole} />
        </TabsContent>
        <TabsContent value="store-checklists" className="pt-4 sm:pt-6">
          <ChecklistInstanceKpiSection groupBy={groupBy} from={from} to={to} isOrgWideRole={isOrgWideRole} />
        </TabsContent>
        <TabsContent value="tickets" className="pt-4 sm:pt-6">
          <TicketKpiSection groupBy={groupBy} from={from} to={to} isOrgWideRole={isOrgWideRole} />
        </TabsContent>
      </Tabs>
    </section>
  );
});
OverviewTabs.displayName = 'OverviewTabs';

// ---------------------------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------------------------

// A failed request used to fall through to the "Quiet around here" empty state, which says nothing
// has happened when the truth is the list never loaded. When only one of the two sources (tickets,
// delegations) failed, the other half still shows, with a notice that the list is incomplete.
const RecentActivitySection = memo(() => {
  const { feed, isPending, isError, refetch } = useRecentActivityFeed();
  if (isError && feed.length === 0) {
    return <InlineError message="Could not load recent activity." onRetry={() => void refetch()} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {isError && <InlineError message="Some activity is missing" onRetry={() => void refetch()} />}
      <RecentActivity feed={feed} isPending={isPending} />
    </div>
  );
});
RecentActivitySection.displayName = 'RecentActivitySection';

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export const OrgOverview = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const orgWide = isOrgWide(user?.role);
  const { patch, groupBy, range, from, to, windowFrom, windowTo, handleGroupBy, handleRange } = useAnalyticsWindow();

  const jumpToSection = useCallback(
    (target: SectionValue) => {
      patch({ tab: target === DEFAULT_SECTION ? null : target });
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => document.getElementById(SECTIONS_ANCHOR_ID)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
    },
    [patch],
  );
  // The full ranking is its own page now, opened with the same time window.
  const location = useLocation();
  const openRankings = useCallback(() => {
    const next = new URLSearchParams(location.search);
    next.delete('tab');
    const search = next.toString();
    navigate(`/admin/rankings${search ? `?${search}` : ''}`);
  }, [location.search, navigate]);

  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  const departmentsQuery = useDepartmentsQuery();
  const storesQuery = useStoresQuery();
  const usersQuery = useUsersQuery(orgWide);

  const snapshotPending = departmentsQuery.isPending || storesQuery.isPending || (orgWide && usersQuery.isPending);
  const snapshotError = departmentsQuery.isError || storesQuery.isError || (orgWide && usersQuery.isError);
  const { refetch: refetchDepartments } = departmentsQuery;
  const { refetch: refetchStores } = storesQuery;
  const { refetch: refetchUsers } = usersQuery;
  const retrySnapshot = useCallback(() => {
    void refetchDepartments();
    void refetchStores();
    // The users list is ADMIN/PC only; refetch() ignores `enabled`, so guard it here.
    if (orgWide) void refetchUsers();
  }, [refetchDepartments, refetchStores, refetchUsers, orgWide]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <h1 className="sr-only">Overview and analytics</h1>
      <ScopeNotice
        role={user?.role}
        departmentId={user?.departmentId}
        storeId={user?.storeId}
        departments={departmentsQuery.data}
        stores={storesQuery.data}
        isUnavailable={departmentsQuery.isPending || storesQuery.isPending || departmentsQuery.isError || storesQuery.isError}
      />

      <AnalyticsControlBar
        groupBy={groupBy}
        onGroupByChange={handleGroupBy}
        range={range}
        onRangeChange={handleRange}
        updatedAt={updatedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
        actions={
          orgWide ? (
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/reports')}>
              <FileDown size={14} aria-hidden="true" />
              Reports
            </Button>
          ) : undefined
        }
      />

      <AnalyticsSummaryStrip groupBy={groupBy} from={from} to={to} onViewSection={jumpToSection} isOrgWideRole={orgWide} />

      {/* Who is top and who is low, right on the page: the full ranked table lives in the Stores
          tab below, this is the glance view of it. Org-wide roles only. */}
      {orgWide && (
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 sm:gap-6 @3xl:grid-cols-2">
            <PerformanceLeadersCard from={windowFrom} to={windowTo} onViewFull={openRankings} />
            <TeamLeaderboardRail from={windowFrom} to={windowTo} />
          </div>
        </div>
      )}

      <OverviewTabs groupBy={groupBy} from={from} to={to} isOrgWideRole={orgWide} />

      <RecentActivitySection />

      {orgWide && (
        <OrgSnapshotStrip
          stores={storesQuery.data ?? EMPTY_STORES}
          departments={departmentsQuery.data ?? EMPTY_DEPARTMENTS}
          users={usersQuery.data ?? EMPTY_USERS}
          isPending={snapshotPending}
          isError={snapshotError}
          onRetry={retrySnapshot}
        />
      )}
    </div>
  );
};
