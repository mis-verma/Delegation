import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../components/button';
import { PageHeader } from '../../components/pageHeader/PageHeader';
import { Segmented } from '../../components/segmented/Segmented';
import { useAnalyticsRefresh } from '../admin/analytics/useAnalyticsQueries';
import { PerformanceLeadersCard } from '../admin/analytics/PerformanceLeadersCard';
import { useOrgToday } from '../checklist/useOrgToday';
import { DashCardLink } from '../dashboard/DashCardHeader';
import { ExceptionsCard } from '../dashboard/ExceptionsCard';
import { windowFor } from '../dashboard/scorePeriods';
import { capWindowAtToday } from '../scores/useScoreWindow';
import { useScoreExplorer } from '../scores/useScoreExplorer';
import { DepartmentHeadsCard } from './DepartmentHeadsCard';
import { OwnerApprovalsCard } from './OwnerApprovalsCard';
import { OwnerScoreCard } from './OwnerScoreCard';
import { PeriodTag } from './PeriodTag';
import { equalSpanBefore } from './ownerWindow';
import { useCanOpen } from './useReadOnlyViewer';

type OwnerPeriod = 'day' | 'week' | 'month';

const PERIODS: readonly { value: OwnerPeriod; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const PERIOD_TEXT: Record<OwnerPeriod, string> = { day: 'Today', week: 'This week', month: 'This month' };

export const OwnerPage = () => {
  const navigate = useNavigate();
  const today = useOrgToday();
  const canOpen = useCanOpen();
  const [period, setPeriod] = useState<OwnerPeriod>('month');
  const periodLabel = PERIOD_TEXT[period];

  const current = useMemo(() => {
    const raw = windowFor(period, 0, today);
    return capWindowAtToday(raw.from, raw.to, today);
  }, [period, today]);
  const before = useMemo(() => equalSpanBefore(current.from, current.to), [current.from, current.to]);

  const now = useScoreExplorer({ from: current.from, to: current.to, view: 'department' });
  const prior = useScoreExplorer({ from: before.from, to: before.to, view: 'department' });
  const nowFresh = now.updating ? undefined : now.data;
  const priorFresh = prior.updating ? undefined : prior.data;

  const queryClient = useQueryClient();
  const { isRefreshing, refresh } = useAnalyticsRefresh();
  const refreshAll = () => {
    void refresh();
    void queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    void queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
  };
  const scoresHref = (view: string) => `/admin/scores?${new URLSearchParams({ view, from: current.from, to: current.to }).toString()}`;
  const deeper = [
    { to: scoresHref('department'), label: 'All scores' },
    { to: '/admin', label: 'Full analytics' },
    { to: '/team/fill', label: 'Fill chart' },
    { to: '/admin/reports', label: 'Reports' },
  ].filter((l) => canOpen(l.to));

  return (
    <div className="flex w-full flex-col gap-6 pt-2.5">
      <PageHeader
        icon={Crown}
        title="Owner view"
        subtitle="The whole company on one screen. Read only."
        actions={
          <>
            <Segmented
              label="Period"
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              className="[&>button]:min-h-11 pointer-fine:[&>button]:min-h-8"
            />
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing} aria-label="Refresh the numbers" className="h-11 shrink-0 pointer-fine:h-8">
              <RotateCw className={cn('size-3.5', isRefreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
              <span className="hidden sm:inline">{isRefreshing ? 'Updating' : 'Refresh'}</span>
            </Button>
          </>
        }
      />

      <OwnerScoreCard
        periodLabel={periodLabel}
        total={nowFresh?.total}
        loading={!nowFresh && !now.isError}
        failed={now.isError && !nowFresh}
        onRetry={() => void now.refetch()}
        compare={{
          before: priorFresh?.total,
          loading: !priorFresh && !prior.isError,
          failed: prior.isError && !priorFresh,
          from: before.from,
          to: before.to,
          days: before.days,
        }}
        detailHref={scoresHref('module')}
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <DepartmentHeadsCard
          departments={nowFresh?.rows}
          loading={!nowFresh && !now.isError}
          failed={now.isError && !nowFresh}
          onRetry={() => void now.refetch()}
          periodLabel={periodLabel}
          from={current.from}
          to={current.to}
        />
        <PerformanceLeadersCard from={current.from} to={current.to} onViewFull={() => void navigate(scoresHref('department'), { viewTransition: true })} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <ExceptionsCard limit={3} aside={<PeriodTag label="Live now" />} />
        <OwnerApprovalsCard from={current.from} to={current.to} periodLabel={periodLabel} />
      </div>

      {deeper.length > 0 && (
        <nav aria-label="Go deeper" className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          {deeper.map((l) => (
            <DashCardLink key={l.to} to={l.to}>{l.label}</DashCardLink>
          ))}
        </nav>
      )}
    </div>
  );
};
