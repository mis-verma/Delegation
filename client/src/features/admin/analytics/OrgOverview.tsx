import { memo, useCallback, useId } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, ClipboardCheck, FileDown, Info, Repeat, TicketCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button, NoticeBanner } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { AnalyticsControlBar, type GroupBy } from './GroupByControl';
import { useAnalyticsWindow, useSearchPatch } from './useAnalyticsWindow';
import { TaskChecklistKpiSection } from './TaskChecklistKpiSection';
import { TicketKpiSection } from './TicketKpiSection';
import { ChecklistInstanceKpiSection } from './ChecklistInstanceKpiSection';
import { AnalyticsSummaryStrip } from './AnalyticsSummaryStrip';
import { OrgSnapshotStrip } from './OrgSnapshotStrip';
import { ApprovalWaitingStrip } from './ApprovalWaitingStrip';
import { PerformanceLeadersCard } from './PerformanceLeadersCard';
import { TeamLeaderboardRail } from './TeamLeaderboardRail';
import { useAnalyticsRefresh } from './useAnalyticsQueries';
import { useOverviewScoreWindow } from './useOverviewScores';
import { MyScoresCard } from '../../dashboard/MyScoresCard';
import { useOrgCounts } from '../../dashboard/scoreQueries';
import type { Department } from '../../../api/departments';
import type { Store } from '../../../api/stores';

const SECTION_TABS = [
  { value: 'delegations', label: 'Delegations', icon: ClipboardCheck },
  { value: 'store-checklists', label: 'Store checklists', icon: Repeat },
  { value: 'tickets', label: 'Tickets', icon: TicketCheck },
] as const;

type SectionValue = (typeof SECTION_TABS)[number]['value'];

const DEFAULT_SECTION: SectionValue = 'delegations';
const SECTIONS_ANCHOR_ID = 'overview-sections';

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
  windowFrom?: string;
  windowTo?: string;
  isOrgWideRole: boolean;
}

// Owns the selected tab, so switching tabs re-renders only this block and never the summary or
// snapshot strips above and below it.
const OverviewTabs = memo(({ groupBy, from, to, windowFrom, windowTo, isOrgWideRole }: OverviewTabsProps) => {
  const headingId = useId();
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const requested = params.get('tab');
  const section: SectionValue = SECTION_TABS.find((t) => t.value === requested)?.value ?? DEFAULT_SECTION;

  return (
    <section id={SECTIONS_ANCHOR_ID} tabIndex={-1} aria-labelledby={headingId} className="flex flex-col gap-4 scroll-mt-4 focus:outline-none lg:scroll-mt-52">
      <h2 id={headingId} className="sr-only">Performance by area</h2>
      <Tabs value={section} onValueChange={(v) => patch({ tab: v === DEFAULT_SECTION ? null : v })}>
        {/* Equal columns on a phone: the icon drops out and a long label wraps to two lines
            instead of clipping. A compact pill group from sm up. */}
        <TabsList aria-label="Performance area" className="grid w-full grid-flow-col auto-cols-fr sm:inline-flex sm:w-fit h-auto">
          {SECTION_TABS.map(({ value, label, icon: Icon }) => (
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

        <TabsContent value="delegations" className="pt-4">
          <TaskChecklistKpiSection groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} isOrgWideRole={isOrgWideRole} />
        </TabsContent>
        <TabsContent value="store-checklists" className="pt-4">
          <ChecklistInstanceKpiSection groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} isOrgWideRole={isOrgWideRole} />
        </TabsContent>
        <TabsContent value="tickets" className="pt-4">
          <TicketKpiSection groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} isOrgWideRole={isOrgWideRole} />
        </TabsContent>
      </Tabs>
    </section>
  );
});
OverviewTabs.displayName = 'OverviewTabs';

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
      requestAnimationFrame(() => {
        const section = document.getElementById(SECTIONS_ANCHOR_ID);
        section?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        // Keyboard and screen reader users land in the section too, not just the eyes.
        section?.focus({ preventScroll: true });
      });
    },
    [patch],
  );
  // The organisation scores follow this page period bar, so the page never shows two windows at once. The same org
  // days (never later than today) go to the explorer, so the Scores page opens on exactly these numbers.
  const scoreWindow = useOverviewScoreWindow(windowFrom, windowTo);
  const scoresHref = useCallback(
    (view: 'department' | 'person') => `/admin/scores?${new URLSearchParams({ view, ...(scoreWindow ? { from: scoreWindow.from, to: scoreWindow.to } : {}) }).toString()}`,
    [scoreWindow],
  );
  // The full ranking is the Scores page now, opened on the same window.
  const openRankings = useCallback(() => navigate(scoresHref('department')), [navigate, scoresHref]);

  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  // Names for the department head's scope notice only. Admin and PC get the four organisation counts
  // from one small request instead of the whole roster, so they never download these lists here.
  const departmentsQuery = useDepartmentsQuery(!orgWide);
  const storesQuery = useStoresQuery(!orgWide);
  const countsQuery = useOrgCounts(orgWide);
  const { refetch: refetchCounts } = countsQuery;
  const retrySnapshot = useCallback(() => void refetchCounts(), [refetchCounts]);

  return (
    <div className="flex w-full flex-col gap-6">
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
            <>
              <Button variant="outline" size="sm" onClick={openRankings}>
                Scores
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin/reports')}>
                <FileDown size={14} aria-hidden="true" />
                Reports
              </Button>
            </>
          ) : undefined
        }
      />

      <AnalyticsSummaryStrip groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} onViewSection={jumpToSection} isOrgWideRole={orgWide} />

      {/* Admin and PC decide the approvals, so how many are waiting and for how long sits right under the headline numbers. */}
      {orgWide && <ApprovalWaitingStrip from={windowFrom} to={windowTo} />}

      {/* Admin and PC: checklists, tickets and delegations side by side for the whole organisation, as
          completion, compliance and on time, with every department ranked under it. */}
      {orgWide && scoreWindow && <MyScoresCard initialScope="org" window={scoreWindow} moreHref={scoresHref('department')} />}

      {/* Who is top and who is low, right on the page: the full ranked table lives in the Stores
          tab below, this is the glance view of it. Org-wide roles only. */}
      {orgWide && (
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            <PerformanceLeadersCard from={windowFrom} to={windowTo} onViewFull={openRankings} />
            <TeamLeaderboardRail from={windowFrom} to={windowTo} />
          </div>
        </div>
      )}

      <OverviewTabs groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} isOrgWideRole={orgWide} />

      {/* The size of the organisation is background, so it sits below the performance cards. */}
      {orgWide && <OrgSnapshotStrip counts={countsQuery.data} isPending={countsQuery.isPending} isError={countsQuery.isError} onRetry={retrySnapshot} />}

    </div>
  );
};
