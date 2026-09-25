import { useMemo, useRef, useState } from 'react';
import { BarChart3, ClipboardCheck, Repeat, TicketCheck, Building2, Contact, ListChecks, Network, FileDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '../../../context/AuthContext';
import { EntityIconTile } from '../../../components';
import { useDepartmentsQuery, useStoresQuery, useTicketsQuery } from '../../tickets/hook';
import { useTasksQuery } from '../../tasks/hook';
import { useUsersQuery } from '../hook';
import { GroupByControl, type GroupBy } from './GroupByControl';
import { TaskChecklistKpiSection } from './TaskChecklistKpiSection';
import { TicketKpiSection } from './TicketKpiSection';
import { ChecklistInstanceKpiSection } from './ChecklistInstanceKpiSection';
import { AnalyticsSummaryStrip } from './AnalyticsSummaryStrip';
import { OrgSnapshotStrip } from './OrgSnapshotStrip';
import { PerformanceLeadersCard } from './PerformanceLeadersCard';
import { StoresPerformanceSection } from './StoresPerformanceSection';
import { ComplianceGaugeRail } from './ComplianceGaugeRail';
import { TeamLeaderboardRail } from './TeamLeaderboardRail';
import { QuickActionsGrid, type QuickAction } from '../overview/QuickActionsGrid';
import { RecentActivity, RECENT_ACTIVITY_FEED_SIZE } from '../../dashboard/RecentActivity';
import type { FeedItem } from '../../dashboard/dashboardDisplay';
import type { DateRangeValue } from '../../../components';
import { endOfDay } from '../../../lib/dateRange';

const ADMIN_QUICK_ACTIONS: readonly QuickAction[] = [
  { to: '/admin/directory', icon: Contact, label: 'People & Teams', description: 'Users, departments & stores' },
  { to: '/admin/org-structure', icon: Network, label: 'Org Structure', description: 'See the reporting ladder' },
  { to: '/admin/checklist-templates', icon: ListChecks, label: 'Task Templates', description: 'Create a template' },
  { to: '/admin/tickets', icon: TicketCheck, label: 'Tickets', description: 'View open issues' },
  { to: '/admin/reports', icon: FileDown, label: 'Reports', description: 'Export data' },
];

const ALL_SECTION_TABS = [
  { value: 'checklists', label: 'Checklists', icon: ClipboardCheck },
  { value: 'audits', label: 'Audits', icon: Repeat },
  { value: 'issues', label: 'Issues', icon: TicketCheck },
  { value: 'stores', label: 'Stores', icon: Building2 },
] as const;

type SectionValue = (typeof ALL_SECTION_TABS)[number]['value'];

// Comparing performance *across* stores/departments is an org-wide (MD) view — a department
// head or store lead only needs their own numbers, not a cross-entity leaderboard. It also
// depends on the ADMIN/PC-only /users list endpoint, which isn't opened up further here.
const canSeeStoresTab = (role?: string) => role === 'ADMIN' || role === 'PC';

// Intentionally uses the token theming system (bg-surface/text-text/border-border, matching
// features/dashboard and features/reports) rather than the raw-Tailwind style its features/admin
// siblings use — it reuses dashboard's token-based StatCard/chart conventions, which already
// handle light/dark correctly. Don't "fix" this to match the admin siblings.
export const OrgOverview = () => {
  const { user } = useAuth();
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });

  const sectionTabs = useMemo(
    () => (canSeeStoresTab(user?.role) ? ALL_SECTION_TABS : ALL_SECTION_TABS.filter((t) => t.value !== 'stores')),
    [user?.role]
  );
  const [section, setSection] = useState<SectionValue>('checklists');
  const tabsRef = useRef<HTMLDivElement>(null);
  const jumpToSection = (target: SectionValue) => {
    setSection(target);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const jumpToStores = () => jumpToSection('stores');
  // AnalyticsSummaryStrip's "Checklist completion" tile used to navigate to
  // /admin/scheduled-checklists (Checklist Templates management — unrelated to the delegation
  // completion rate it shows, and ADMIN/PC-only) instead of the Checklists tab right below it on
  // this same page, which is the actual section that explains this number. Jumping to a tab here
  // also sidesteps the role gate entirely: MANAGER/SENIOR can reach this page via /analytics but
  // not /admin/*, so this is the only version of the fix that works for every role that sees it.
  const jumpToChecklists = () => jumpToSection('checklists');

  // range.to is a plain calendar date at local midnight (DateRangePicker isn't in showTime mode
  // here) — wrap it to the end of that day so a "to" bound doesn't silently exclude the whole day.
  const from = range.from ? range.from.toISOString() : undefined;
  const to = range.to ? endOfDay(range.to).toISOString() : undefined;

  const { data: departments, isPending: departmentsPending, isError: departmentsError } = useDepartmentsQuery();
  const { data: stores, isPending: storesPending, isError: storesError } = useStoresQuery();
  const { data: orgUsers, isPending: orgUsersPending, isError: orgUsersError } = useUsersQuery(canSeeStoresTab(user?.role));
  const scopeLabel = useMemo(() => {
    if (user?.role === 'MANAGER') {
      const dept = departments?.find((d) => d.id === user.departmentId);
      return dept ? `Department: ${dept.name}` : 'Department: unassigned';
    }
    if (user?.role === 'SENIOR') {
      const store = stores?.find((s) => s.id === user.storeId);
      return store ? `Store: ${store.name}` : 'Store: unassigned';
    }
    return 'Org-wide';
  }, [user, departments, stores]);

  const { data: ticketPage, isPending: ticketsPending } = useTicketsQuery(1, 100);
  const { data: tasks, isPending: tasksPending } = useTasksQuery();
  const tickets = ticketPage?.data ?? [];
  const isFeedPending = ticketsPending || tasksPending;
  const feed: FeedItem[] = [
    ...tickets.map((t): FeedItem => ({ kind: 'ticket', id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
    ...(tasks ?? []).map((t): FeedItem => ({ kind: 'task', id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_ACTIVITY_FEED_SIZE);

  return (
    // max-w-(--container-width), not max-w-7xl — matches every other page's shared width token
    // instead of sitting narrower with bigger side margins than its own siblings.
    <div className="flex flex-col gap-8 w-full max-w-(--container-width) mx-auto">
        {/* lg:flex-row (was sm:), plus flex-wrap as a safety net — the title block (icon + heading
            + description) and GroupByControl (4 tabs + a 256px date picker) together need roughly
            1150px to sit on one line. From sm (640px) up to that point the row had nowhere to
            actually shrink into (GroupByControl's date picker has a fixed width, so all the give
            came from squeezing the title text) and the Custom range button rendered past the
            visible edge with no scrollbar to reach it — flex-wrap alone still let the flex algorithm
            find just enough slack in the title to avoid triggering a real line break. Staying
            stacked until lg (1024px) — the width the row realistically needs to just work — instead
            of trying to time a wrap exactly at the edge case. */}
        <header className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end justify-between gap-x-6 gap-y-4 pb-6 border-b border-border">
          <div className="flex items-start gap-4">
            <EntityIconTile icon={BarChart3} tone="primary" className="size-11" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-display font-bold tracking-tight text-text">Overview</h1>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-display font-medium bg-primary-500/10 text-primary-700 dark:text-primary-400">
                  {scopeLabel}
                </span>
              </div>
              <p className="text-sm font-display text-text-muted max-w-lg leading-relaxed">
                Checklist, audit, issue and store performance in one place.
              </p>
            </div>
          </div>

          <GroupByControl groupBy={groupBy} onGroupByChange={setGroupBy} range={range} onRangeChange={setRange} />
        </header>

        {/* Owner-level "how big is my org right now" glance — stores, departments, headcount +
            new hires, department-lead coverage. Comes before the work-performance metrics below
            since it's the shape of the org itself, not how the org is performing. */}
        {canSeeStoresTab(user?.role) && (
          <OrgSnapshotStrip
            stores={stores ?? []}
            departments={departments ?? []}
            users={orgUsers ?? []}
            isPending={departmentsPending || storesPending || orgUsersPending}
            isError={departmentsError || storesError || orgUsersError}
          />
        )}

        <AnalyticsSummaryStrip groupBy={groupBy} from={from} to={to} onViewChecklists={jumpToChecklists} isOrgWideRole={canSeeStoresTab(user?.role)} />

        {/* Real store/department "who's top, who's low" numbers, visible on the dashboard itself —
            previously the only way to see this combined ranking was to switch into the Stores tab
            below, so it went unnoticed unless someone clicked in. */}
        {canSeeStoresTab(user?.role) && (
          <PerformanceLeadersCard groupBy={groupBy} from={from} to={to} onViewFull={jumpToStores} />
        )}

        {canSeeStoresTab(user?.role) && <QuickActionsGrid actions={ADMIN_QUICK_ACTIONS} />}

        {(() => {
          const tabsBlock = (
            <Tabs value={section} onValueChange={(v) => setSection(v as SectionValue)}>
              {/* Scrolls horizontally instead of clipping on phone-width screens, where four tabs
                  don't fit in one row — AdminLayout's <main> is overflow-x-hidden, so the tab
                  row needs its own scroll container rather than relying on page scroll. */}
              {/* Same quiet segmented-control look GroupByControl's Day/Week/Month/Year toggle
                  uses right above it — this used to repaint the active state bold-primary-filled,
                  the one place on the page where the shared Tabs component read as a different,
                  unrelated control instead of the same one twice. */}
              <div ref={tabsRef} className="overflow-x-auto">
                <TabsList className="h-auto w-fit">
                  {sectionTabs.map(({ value, label, icon: Icon }) => (
                    <TabsTrigger key={value} value={value} className="gap-2 px-4 py-2 font-display">
                      <Icon className="w-4 h-4" />
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="checklists" className="pt-6">
                <TaskChecklistKpiSection groupBy={groupBy} from={from} to={to} isOrgWideRole={canSeeStoresTab(user?.role)} />
              </TabsContent>
              <TabsContent value="audits" className="pt-6">
                <ChecklistInstanceKpiSection groupBy={groupBy} from={from} to={to} isOrgWideRole={canSeeStoresTab(user?.role)} />
              </TabsContent>
              <TabsContent value="issues" className="pt-6">
                <TicketKpiSection groupBy={groupBy} from={from} to={to} isOrgWideRole={canSeeStoresTab(user?.role)} />
              </TabsContent>
              {canSeeStoresTab(user?.role) && (
                <TabsContent value="stores" className="pt-6">
                  <StoresPerformanceSection groupBy={groupBy} from={from} to={to} />
                </TabsContent>
              )}
            </Tabs>
          );

          // The compliance/leaderboard rail surfaces the same org-wide comparison data as the
          // Stores tab, so it's gated identically — MANAGER/SENIOR get the tabs full-width with
          // no rail, instead of an empty third column.
          if (!canSeeStoresTab(user?.role)) return tabsBlock;

          return (
            // items-stretch, not items-start — the right rail (two compact cards) is naturally
            // shorter than the tabs column next to it (KPI cards + a 260px chart), which used to
            // leave a visible block of empty page background under the rail instead of it running
            // the full height of its taller sibling.
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="lg:col-span-2">{tabsBlock}</div>
              <div className="flex flex-col gap-6">
                <ComplianceGaugeRail groupBy={groupBy} from={from} to={to} />
                <TeamLeaderboardRail from={from} to={to} />
              </div>
            </div>
          );
        })()}

        <RecentActivity feed={feed} isPending={isFeedPending} />
    </div>
  );
};
