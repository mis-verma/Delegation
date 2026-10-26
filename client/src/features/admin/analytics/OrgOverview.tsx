import { memo, useCallback, useId } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowRight, ClipboardCheck, FileDown, Info, Repeat, TicketCheck } from 'lucide-react';
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
import { PhoneCollapse } from './PhoneCollapse';
import { ExportRegistryProvider, OverviewExportMenu } from './ExportRegistry';
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

const isOrgWide = (role?: string) => role === 'ADMIN' || role === 'PC' || role === 'OWNER';

interface ScopeNoticeProps {
  role?: string;
  departmentId?: string | null;
  storeId?: string | null;
  departments?: Department[];
  stores?: Store[];
  isUnavailable: boolean;
}

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
  if (role === 'SENIOR' && (!storeId || !departmentId)) {
    const text = !storeId && !departmentId
      ? 'No store or department is assigned to your account, so there are no numbers to show yet. Ask an admin to set one.'
      : !storeId
        ? 'No store is assigned to your account, so the ticket and delegation charts are empty. Scores and checklists still show your department. Ask an admin to set a store.'
        : 'No department is assigned to your account, so scores and checklists are empty. Ticket and delegation charts still show your store. Ask an admin to set a department.';
    return (
      <NoticeBanner tone="warning" icon={AlertTriangle}>
        {text}
      </NoticeBanner>
    );
  }

  return (
    <NoticeBanner tone="info" icon={Info}>
      {role === 'MANAGER'
        ? `You are seeing numbers for the ${department?.name} department only.`
        : `Scores and checklists are for the ${department?.name ?? 'your'} department. Ticket and delegation charts are for ${store?.name ?? 'your store'}.`}
    </NoticeBanner>
  );
});
ScopeNotice.displayName = 'ScopeNotice';

interface OverviewTabsProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  windowFrom?: string;
  windowTo?: string;
  isOrgWideRole: boolean;
}

const OverviewTabs = memo(({ groupBy, from, to, windowFrom, windowTo, isOrgWideRole }: OverviewTabsProps) => {
  const headingId = useId();
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const requested = params.get('tab');
  const section: SectionValue = SECTION_TABS.find((t) => t.value === requested)?.value ?? DEFAULT_SECTION;

  return (
    <section id={SECTIONS_ANCHOR_ID} tabIndex={-1} aria-labelledby={headingId} className="flex flex-col gap-4 scroll-mt-4 focus:outline-none">
      <h2 id={headingId} className="sr-only">Performance by area</h2>
      <Tabs value={section} onValueChange={(v) => patch({ tab: v === DEFAULT_SECTION ? null : v })}>
        <TabsList aria-label="Performance area" className="grid w-full grid-flow-col auto-cols-fr sm:inline-flex sm:w-fit h-auto">
          {SECTION_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 sm:min-h-9 px-1.5 sm:px-3 t-meta sm:text-sm text-center leading-tight whitespace-normal sm:whitespace-nowrap"
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
        section?.focus({ preventScroll: true });
      });
    },
    [patch],
  );
  const scoreWindow = useOverviewScoreWindow(windowFrom, windowTo);
  const scoresHref = useCallback(
    (view: 'department' | 'person') => `/admin/scores?${new URLSearchParams({ view, ...(scoreWindow ? { from: scoreWindow.from, to: scoreWindow.to } : {}) }).toString()}`,
    [scoreWindow],
  );
  const openRankings = useCallback(() => navigate(scoresHref('department')), [navigate, scoresHref]);

  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  const departmentsQuery = useDepartmentsQuery(!orgWide);
  const storesQuery = useStoresQuery(!orgWide);
  const countsQuery = useOrgCounts(orgWide);
  const { refetch: refetchCounts } = countsQuery;
  const retrySnapshot = useCallback(() => void refetchCounts(), [refetchCounts]);

  return (
    <ExportRegistryProvider>
    <div className="flex w-full flex-col gap-3">
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
        sticky={false}
        actions={<OverviewExportMenu />}
        onRefresh={() => void refresh()}
      />

      <AnalyticsSummaryStrip groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} onViewSection={jumpToSection}
        isOrgWideRole={orgWide}
        links={
          orgWide ? (
            <>
              <Button variant="ghost" size="sm" onClick={openRankings}>
                Scores
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/reports')}>
                <FileDown size={14} aria-hidden="true" />
                Reports
              </Button>
            </>
          ) : undefined
        }
      />

      {orgWide && (
        <PhoneCollapse title="Waiting for approval" defaultOpen>
          <ApprovalWaitingStrip from={windowFrom} to={windowTo} />
        </PhoneCollapse>
      )}

      {orgWide && scoreWindow && <MyScoresCard initialScope="org" window={scoreWindow} moreHref={scoresHref('department')} hideRanking />}

      {orgWide && (
        <PhoneCollapse title="Stores, departments and leaders" hint="Top and lowest scores">
          <div className="@container">
            <div className="grid grid-cols-1 items-start gap-3 @3xl:grid-cols-2">
              <PerformanceLeadersCard from={windowFrom} to={windowTo} onViewFull={openRankings} />
              <TeamLeaderboardRail from={windowFrom} to={windowTo} />
            </div>
          </div>
        </PhoneCollapse>
      )}

      <OverviewTabs groupBy={groupBy} from={from} to={to} windowFrom={windowFrom} windowTo={windowTo} isOrgWideRole={orgWide} />

      {orgWide && (
        <PhoneCollapse title="Your organisation" hint="Stores, departments and people">
          <OrgSnapshotStrip counts={countsQuery.data} isPending={countsQuery.isPending} isError={countsQuery.isError} onRetry={retrySnapshot} />
        </PhoneCollapse>
      )}

    </div>
    </ExportRegistryProvider>
  );
};
