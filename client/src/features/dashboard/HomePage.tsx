import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Briefcase, Globe2, Siren, SlidersHorizontal, User, Users } from 'lucide-react';
import { HomeSection } from './HomeSection';
import { CustomizeHomeSheet } from './CustomizeHomeSheet';
import { useHomeLayout, type HomeSectionId } from './homeLayout';
import { haptic } from '../../lib/haptics';
import { useAuth } from '../../context/AuthContext';
import { useNow } from '../../lib/useNow';
import { SlidingTabs, Skeleton, type SlidingTabOption } from '../../components';
import { useTicketsPagedQuery } from '../tickets/hook';
import { HomeStats, type StatScope } from './HomeStats';
import { teamApprovalFigure } from './approvalFigures';
import { OvertimeNotice } from './OvertimeNotice';
import { OverdueTicketsPopup } from './OverdueTicketsPopup';
import { EnableAlertsBanner } from '../notifications/EnableAlertsBanner';
import { useOrgToday } from '../checklist/useOrgToday';
import { StreakGoalCard } from './StreakGoalCard';
import { CoverBanner } from './CoverBanner';
import { dashboardViewFor } from './dashboardView';
import { useDashboardSummaries } from './useDashboardSummaries';
import { useExceptionTotalsQuery } from './useExceptionsQuery';
import { useApprovalSources } from './useApprovalSources';
import { usePcApprovalBuckets } from '../pc/usePcApprovalBuckets';
import type { Ticket } from '../../api/ticket';

const ExceptionsCard = lazy(() => import('./ExceptionsCard').then((m) => ({ default: m.ExceptionsCard })));
const TeamWeekHeat = lazy(() => import('./TeamWeekHeat').then((m) => ({ default: m.TeamWeekHeat })));
const MyTeamCard = lazy(() => import('../attention/MyTeamCard').then((m) => ({ default: m.MyTeamCard })));

const ATTENTION_TAB_LIMIT = 20;
const NO_TICKETS: Ticket[] = [];

const STAT_SCOPE_KEY = 'tm-home-stat-scope';

const readStatScope = (): StatScope => {
  try {
    return window.localStorage.getItem(STAT_SCOPE_KEY) === 'mine' ? 'mine' : 'overall';
  } catch {
    return 'overall';
  }
};

type HomeTab = 'work' | 'attention';

const HOME_TABS: readonly HomeTab[] = ['work', 'attention'];
const isHomeTab = (value: string | null): value is HomeTab => !!value && (HOME_TABS as readonly string[]).includes(value);

const PANEL_FALLBACK = <Skeleton className="h-64 rounded-2xl" />;

const HomeHeading = () => {
  const now = useNow();
  return <h1 className="sr-only">Today, {new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>;
};

export const HomePage = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const dashboardView = useMemo(() => dashboardViewFor(user?.role), [user?.role]);
  const hasTabs = dashboardView.orgWide || dashboardView.isHod;
  const orgToday = useOrgToday();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: HomeTab = hasTabs && isHomeTab(requested) ? requested : 'work';

  const approvalSources = useApprovalSources();
  const queueHref = approvalSources.queueHref ?? '/verify';

  const changeTab = (next: HomeTab) => {
    if (next === tab) return;
    haptic('tap');
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === 'work') out.delete('tab');
      else out.set('tab', next);
      return out;
    }, { replace: true });
  };

  const layout = useHomeLayout(userId);
  const [customizing, setCustomizing] = useState<HomeSectionId | 'menu' | null>(null);

  const [statScope, setStatScope] = useState<StatScope>(readStatScope);
  const ownStats = hasTabs && statScope === 'mine';
  const changeStatScope = (next: StatScope) => {
    if (next === statScope) return;
    haptic('tap');
    setStatScope(next);
    try {
      window.localStorage.setItem(STAT_SCOPE_KEY, next);
    } catch {
      return;
    }
  };

  const summaries = useDashboardSummaries(!hasTabs || ownStats ? 'mine' : undefined);
  const ownSummaries = useDashboardSummaries('mine');
  const lateTicketsQuery = useTicketsPagedQuery({ page: 1, bucket: 'delayed', assigneeIds: userId ? [userId] : [] }, !!userId);
  const approvalBuckets = usePcApprovalBuckets();
  const exceptionTotals = useExceptionTotalsQuery();
  const myLateTickets = lateTicketsQuery.data?.data ?? NO_TICKETS;
  const myLateTotal = lateTicketsQuery.data?.meta?.total;

  const attentionCount = exceptionTotals.data
    ? exceptionTotals.data.tickets + exceptionTotals.data.delegations + exceptionTotals.data.missedRuns
    : 0;

  const ownKpi = ownSummaries.kpi;
  const myPending = (ownKpi.tasks.data?.pending ?? 0) + (ownKpi.tickets.data?.pending ?? 0) + (ownKpi.checklistToday.data?.pending ?? 0) + (ownKpi.todos.data?.pending ?? 0);

  const tabOptions: readonly SlidingTabOption<HomeTab>[] = [
    { value: 'work', label: 'My work', icon: Briefcase, badge: myPending, badgeTone: 'primary', ariaLabel: `My work, ${myPending} open` },
    { value: 'attention', label: 'Needs attention', shortLabel: 'Attention', icon: Siren, badge: attentionCount, badgeTone: 'danger', ariaLabel: `Needs attention, ${attentionCount} items` },
  ];

  const scopeOptions: readonly SlidingTabOption<StatScope>[] = [
    { value: 'overall', label: dashboardView.orgWide ? 'Overall' : 'My team', icon: dashboardView.orgWide ? Globe2 : Users },
    { value: 'mine', label: 'My own', icon: User },
  ];

  const approvalSourcesLoading = approvalSources.isPending;
  const approvalTotal = approvalBuckets.total;
  const approvalFailed = approvalSources.hasError;
  const teamApproval = useMemo(
    () => teamApprovalFigure(approvalTotal, queueHref, approvalSourcesLoading && approvalTotal.pending === 0, approvalFailed && approvalTotal.pending === 0),
    [approvalTotal, queueHref, approvalSourcesLoading, approvalFailed],
  );
  const currentScope: StatScope = hasTabs ? statScope : 'mine';
  const overview = (
    <HomeStats
      kpi={summaries.kpi}
      scope={currentScope}
      teamLabel={dashboardView.orgWide ? 'Overall' : 'My team'}
      approval={currentScope === 'mine' ? undefined : teamApproval}
    />
  );

  const statSection = hasTabs ? (
    <section aria-labelledby="home-stats-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="home-stats-heading" className="t-section font-display font-bold text-text">Numbers today</h2>
        <SlidingTabs label="Whose numbers to show" value={statScope} options={scopeOptions} onChange={changeStatScope} size="sm" fill="phone" className="max-sm:w-full" />
      </div>
      {overview}
    </section>
  ) : overview;

  const sectionIds: readonly HomeSectionId[] = hasTabs
    ? ['stats', 'streak', ...(dashboardView.isHod ? (['myTeam'] as const) : []), 'teamWeek']
    : ['stats', 'streak'];
  const shown = (id: HomeSectionId) => !layout.isHidden(id);
  const hiddenCount = layout.hiddenCount(sectionIds);
  const section = (id: HomeSectionId, node: ReactNode) =>
    shown(id) ? <HomeSection id={id} onHold={setCustomizing}>{node}</HomeSection> : null;

  const customizeFooter = (
    <div className="flex flex-col items-center gap-2 pt-2">
      {hiddenCount === sectionIds.length && (
        <p className="t-card font-display font-semibold text-text-secondary">Everything on Home is hidden.</p>
      )}
      <button
        type="button"
        onClick={() => setCustomizing('menu')}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/60 bg-surface px-4 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 ease-out cursor-pointer hover:border-primary-500/40 hover:text-text active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        Customize Home
        {hiddenCount > 0 && (
          <span className="rounded-full bg-primary-500/10 px-2 py-0.5 tabular-nums text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{hiddenCount} hidden</span>
        )}
      </button>
      <p className="t-meta text-text-muted">
        <span className="pointer-fine:hidden">Press and hold any section to hide or show it.</span>
        <span className="pointer-coarse:hidden">Pick which sections show on your Home.</span>
      </p>
    </div>
  );

  if (hasTabs && requested === 'approvals') return <Navigate to={queueHref} replace />;

  return (
    <div className="flex w-full flex-col gap-6 pt-2.5">
      <HomeHeading />

      <OverdueTicketsPopup tickets={myLateTickets} total={myLateTotal} userId={userId} />
      <CoverBanner />
      <OvertimeNotice today={orgToday} />
      <EnableAlertsBanner />

      {hasTabs ? (
        <>
          <SlidingTabs label="Home views" value={tab} options={tabOptions} onChange={changeTab} fill="phone" className="max-sm:w-full sm:self-start" />
          <div key={tab} className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
            {tab === 'work' && (
              <>
                {section('stats', statSection)}
                {section('streak', <StreakGoalCard />)}
                <Suspense fallback={PANEL_FALLBACK}>
                  {dashboardView.isHod && section('myTeam', <MyTeamCard />)}
                  {section('teamWeek', <TeamWeekHeat />)}
                </Suspense>
                {customizeFooter}
              </>
            )}
            {tab === 'attention' && (
              <Suspense fallback={PANEL_FALLBACK}>
                <ExceptionsCard limit={ATTENTION_TAB_LIMIT} />
              </Suspense>
            )}
          </div>
        </>
      ) : (
        <>
          {section('stats', statSection)}
          {section('streak', <StreakGoalCard />)}
          {customizeFooter}
        </>
      )}

      {customizing && (
        <CustomizeHomeSheet
          sections={sectionIds}
          focusId={customizing === 'menu' ? null : customizing}
          isHidden={layout.isHidden}
          onChange={layout.setVisible}
          onShowAll={layout.showAll}
          onClose={() => setCustomizing(null)}
        />
      )}
    </div>
  );
};
