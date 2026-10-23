import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components';
import { useOrgToday } from '../checklist/useOrgToday';
import { ScoreBars } from '../dashboard/ScoreBars';
import { ScoreHero } from '../dashboard/ScoreHero';
import { ExceptionsCard } from '../dashboard/ExceptionsCard';
import { heroFacts } from '../dashboard/heroFacts';
import { windowFor, type ScorePeriod } from '../dashboard/scorePeriods';
import { useScopeScores } from '../scores/useExplorerScores';
import { capWindowAtToday } from '../scores/useScoreWindow';
import { ApprovalWaitingStrip } from '../admin/analytics/ApprovalWaitingStrip';
import { PerformanceLeadersCard } from '../admin/analytics/PerformanceLeadersCard';
import { TeamLeaderboardRail } from '../admin/analytics/TeamLeaderboardRail';

const PERIODS: readonly { value: ScorePeriod; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const SectionTitle = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex flex-col gap-0.5">
    <h2 className="t-section font-display font-bold tracking-tight text-text">{title}</h2>
    {hint && <p className="t-meta text-text-muted">{hint}</p>}
  </div>
);

export const OwnerPage = () => {
  const navigate = useNavigate();
  const today = useOrgToday();
  const [period, setPeriod] = useState<ScorePeriod>('week');

  const current = useMemo(() => {
    const raw = windowFor(period, 0, today);
    return { ...capWindowAtToday(raw.from, raw.to, today), label: raw.label };
  }, [period, today]);
  const before = useMemo(() => {
    const raw = windowFor(period, -1, today);
    return capWindowAtToday(raw.from, raw.to, today);
  }, [period, today]);

  const now = useScopeScores({ scope: 'org', id: undefined, from: current.from, to: current.to, enabled: true });
  const prior = useScopeScores({ scope: 'org', id: undefined, from: before.from, to: before.to, enabled: true });

  const nowOverall = heroFacts(now.data).overall;
  const priorOverall = heroFacts(prior.data).overall;
  const change = nowOverall !== null && priorOverall !== null ? nowOverall - priorOverall : null;
  const loading = !now.data && now.isPending;
  const scoresHref = (view: string) => `/admin/scores?${new URLSearchParams({ view, from: current.from, to: current.to }).toString()}`;

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white">
            <Crown className="size-5" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="t-section font-display font-bold tracking-tight text-text">Owner view</h1>
            <p className="t-meta text-text-muted">The whole company on one screen. {current.label}.</p>
          </div>
        </div>
        <div role="group" aria-label="Period" className="inline-flex w-full items-center gap-1 rounded-xl border border-border bg-surface-hover/40 p-1 sm:w-auto">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
              className={cn(
                'inline-flex min-h-9 flex-1 items-center justify-center rounded-lg px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:flex-none',
                period === p.value ? 'bg-primary-600 text-white dark:bg-primary-500' : 'text-text-muted hover:bg-surface hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <section aria-label="Company score" className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4')}>
        <ScoreHero facts={heroFacts(now.data)} loading={loading} changePts={change} title="Company score" />
        <ScoreBars
          scores={now.data}
          loading={loading}
          previous={prior.data}
          onOpenModule={() => void navigate(scoresHref('module'), { viewTransition: true })}
          emptyText="Nothing was due in this window"
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <section aria-label="Needs attention" className="flex min-w-0 flex-col gap-3">
          <SectionTitle title="Needs attention" hint="Late work and people who are behind" />
          <ExceptionsCard />
        </section>
        <section aria-label="Waiting for approval" className="flex min-w-0 flex-col gap-3">
          <SectionTitle title="Waiting for approval" hint="Checklists, tickets and delegations held up" />
          <ApprovalWaitingStrip from={current.from} to={current.to} />
        </section>
      </div>

      <section aria-label="Stores, departments and people" className="flex flex-col gap-3">
        <SectionTitle title="Best and lowest" hint="Stores, departments and people for the same period" />
        <div className="@container">
          <div className="grid grid-cols-1 items-start gap-3 @3xl:grid-cols-2">
            <PerformanceLeadersCard from={current.from} to={current.to} onViewFull={() => void navigate(scoresHref('department'))} />
            <TeamLeaderboardRail from={current.from} to={current.to} />
          </div>
        </div>
      </section>

      <nav aria-label="Go deeper" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-4">
        {[
          { to: scoresHref('department'), label: 'All scores' },
          { to: '/admin', label: 'Full analytics' },
          { to: '/admin/reports', label: 'Reports' },
        ].map((l) => (
          <Link key={l.to} to={l.to} viewTransition className="inline-flex min-h-9 items-center gap-1 t-meta font-display font-semibold text-primary-600 hover:underline pointer-coarse:min-h-11 dark:text-primary-300">
            {l.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
};
