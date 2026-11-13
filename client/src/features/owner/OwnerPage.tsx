import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../components/button';
import { SlidingTabs, type SlidingTabOption } from '../../components';
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
import { likeForLikeBefore } from './ownerWindow';
import { useCanOpen } from './useReadOnlyViewer';

type OwnerPeriod = 'day' | 'week' | 'month';

const PERIODS: readonly SlidingTabOption<OwnerPeriod>[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week', shortLabel: 'Week' },
  { value: 'month', label: 'This month', shortLabel: 'Month' },
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
  const before = useMemo(() => likeForLikeBefore(period, current.from, current.to), [period, current.from, current.to]);

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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="sr-only">Owner view</h1>
        <p className="t-meta font-medium text-text-secondary max-sm:hidden">
          The whole company on one screen, {periodLabel.toLowerCase()}. Read only.
        </p>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
          <SlidingTabs
            label="Period"
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            size="sm"
            fill="phone"
            className="max-sm:min-w-0 max-sm:flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={refreshAll}
            disabled={isRefreshing}
            aria-label="Refresh the numbers"
            title="Refresh the numbers"
            className="size-13 shrink-0 gap-1.5 rounded-full p-0 font-display sm:h-11 sm:w-auto sm:px-4"
          >
            <RotateCw className={cn('size-4', isRefreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">{isRefreshing ? 'Updating' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <DepartmentHeadsCard
          departments={nowFresh?.rows}
          loading={!nowFresh && !now.isError}
          failed={now.isError && !nowFresh}
          onRetry={() => void now.refetch()}
          from={current.from}
          to={current.to}
        />
        <div className="flex min-w-0 flex-col gap-4 lg:[&>*:last-child]:flex-1">
          <OwnerApprovalsCard from={current.from} to={current.to} periodLabel={periodLabel} />
          <PerformanceLeadersCard from={current.from} to={current.to} onViewFull={() => void navigate(scoresHref('department'), { viewTransition: true })} />
        </div>
      </div>

      <ExceptionsCard limit={3} />

      {deeper.length > 0 && (
        <nav aria-label="Go deeper" className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 pb-2">
          {deeper.map((l) => (
            <DashCardLink key={l.to} to={l.to}>{l.label}</DashCardLink>
          ))}
        </nav>
      )}
    </div>
  );
};
