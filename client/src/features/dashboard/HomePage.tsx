import { Suspense, lazy, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Briefcase, Globe2, Siren, User, Users } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { useAuth } from '../../context/AuthContext';
import { useNow } from '../../lib/useNow';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { SlidingTabs, Skeleton, type SlidingTabOption } from '../../components';
import { useTicketsQuery } from '../tickets/hook';
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

const TEAM_TICKET_LIMIT = 250;
const OWN_TICKET_LIMIT = 100;
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

export const HomePage = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const dashboardView = useMemo(() => dashboardViewFor(user?.role), [user?.role]);
  const frontLine = dashboardView.frontLine;
  const hasTabs = dashboardView.orgWide || dashboardView.isHod;
  const orgToday = useOrgToday();
  const now = useNow();
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
  const teamTicketsQuery = useTicketsQuery(1, TEAM_TICKET_LIMIT, undefined, frontLine, DASHBOARD_QUERY_OPTIONS);
  const ownTicketsQuery = useTicketsQuery(1, OWN_TICKET_LIMIT, userId, !!userId && !frontLine, DASHBOARD_QUERY_OPTIONS);
  const approvalBuckets = usePcApprovalBuckets();
  const exceptionTotals = useExceptionTotalsQuery();

  const teamTicketPage = teamTicketsQuery.data;
  const ownTicketPage = ownTicketsQuery.data;
  const myAssignedTickets = useMemo(
    () => (frontLine ? (teamTicketPage?.data ?? NO_TICKETS).filter((t) => t.assigneeId === userId) : (ownTicketPage?.data ?? NO_TICKETS)),
    [frontLine, teamTicketPage, ownTicketPage, userId],
  );

  const heading = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

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
  const teamApproval = teamApprovalFigure(approvalBuckets.total, queueHref, approvalSourcesLoading && approvalBuckets.total.pending === 0, approvalSources.hasError && approvalBuckets.total.pending === 0);
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

  if (hasTabs && requested === 'approvals') return <Navigate to={queueHref} replace />;

  return (
    <div className="flex w-full flex-col gap-6 pt-2.5">
      <h1 className="sr-only">Today, {heading}</h1>

      <OverdueTicketsPopup tickets={myAssignedTickets} userId={userId} />
      <CoverBanner />
      <OvertimeNotice today={orgToday} />
      <EnableAlertsBanner />

      {hasTabs ? (
        <>
          <SlidingTabs label="Home views" value={tab} options={tabOptions} onChange={changeTab} fill="phone" className="max-sm:w-full sm:self-start" />
          <div key={tab} className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
            {tab === 'work' && (
              <>
                {statSection}
                <StreakGoalCard />
                <Suspense fallback={PANEL_FALLBACK}>
                  {dashboardView.isHod && <MyTeamCard />}
                  <TeamWeekHeat />
                </Suspense>
              </>
            )}
            {tab === 'attention' && (
              <Suspense fallback={PANEL_FALLBACK}>
                <ExceptionsCard />
              </Suspense>
            )}
          </div>
        </>
      ) : (
        <>
          {statSection}
          <StreakGoalCard />
        </>
      )}
    </div>
  );
};
