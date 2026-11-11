import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, Grid3x3, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, EmptyState, ExportMenu, InlineError, Skeleton, ToggleChip } from '../../components';
import { PANEL_CLASS } from '../../components/entityCard';
import { scoreApi, type ScoreReportRow } from '../../api/scores';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { useOrgToday } from '../checklist/useOrgToday';
import { windowFor } from '../dashboard/scorePeriods';
import { PersonAttentionSheet } from './PersonAttentionSheet';
import { pctText, scoreBar, scoreTone } from './attentionDisplay';
import { FAIR_FROM, GOOD_FROM } from '../../lib/scoreBands';
import { ToneChip } from '../dashboard/ToneChip';
import { figureToneOf, toneOf } from '../dashboard/scoreTone';
import { DashCardHeader } from '../dashboard/DashCardHeader';
import { FigureCard } from '../dashboard/FigureCard';

type Period = 'day' | 'week' | 'month';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];
const PREVIEW = 6;

const approvedOf = (r: ScoreReportRow) => (r.checklist.submitted > 0 ? (r.checklist.approved / r.checklist.submitted) * 100 : null);

const pctFormat = (n: number) => `${Math.round(n)}%`;

const Metric = ({ label, value }: { label: string; value: number | null | undefined }) => (
  <span className="inline-flex items-center gap-1 t-meta font-medium text-text-muted">
    <span className={cn('size-1.5 rounded-full', scoreBar(value))} aria-hidden />
    {label}
    <span className={cn('font-semibold tabular-nums', scoreTone(value))}>{pctText(value)}</span>
  </span>
);

const FOOT_LINK = 'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-hover/70 px-3.5 t-meta font-display font-semibold text-text-secondary ring-1 ring-inset ring-border/60 outline-none transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] pointer-fine:min-h-9';

export const MyTeamCard = () => {
  const today = useOrgToday();
  const [period, setPeriod] = useState<Period>('day');
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const win = windowFor(period, 0, today);
  const to = win.to > today ? today : win.to;

  const report = useQuery({
    queryKey: ['scores', 'my-team', win.from, to],
    queryFn: () => scoreApi.report({ from: win.from, to }),
    retry: handleQueryRetry,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });

  const people = useMemo(() => (report.data?.people ?? []).filter((p) => p.id !== 'unassigned' && !p.left), [report.data]);
  const rankOf = useMemo(() => {
    const ranked = people.filter((p) => p.overall !== null && p.overall !== undefined).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    return new Map(ranked.map((p, i) => [p.id, i + 1]));
  }, [people]);
  const worstFirst = useMemo(
    () => [...people].sort((a, b) => (a.overall ?? 101) - (b.overall ?? 101) || a.name.localeCompare(b.name)),
    [people],
  );
  const total = report.data?.total;
  const loading = report.isPending;
  const noScores = !loading && worstFirst.length === 0;

  const exportRows = () => [
    ['Rank', 'Name', 'Overall %', 'Checklist completion %', 'Checklist compliance %', 'Checklists approved %', 'Ticket score %', 'Delegation score %', 'Checklists due', 'Tickets due', 'Delegations due'],
    ...[...people].sort((a, b) => (rankOf.get(a.id) ?? 9999) - (rankOf.get(b.id) ?? 9999)).map((p) => [
      rankOf.get(p.id) ?? '',
      p.name,
      p.overall ?? '',
      p.checklist.completionPct ?? '',
      p.checklist.compliancePct ?? '',
      approvedOf(p) === null ? '' : Math.round(approvedOf(p)!),
      p.ticket.score ?? '',
      p.delegation.score ?? '',
      p.checklist.due,
      p.ticket.due,
      p.delegation.due,
    ]),
  ];

  const teamScore = total?.overall ?? null;
  const filled = total?.checklist.completionPct ?? null;
  const compliance = total?.checklist.compliancePct ?? null;

  return (
    <section aria-labelledby="my-team-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <DashCardHeader
        id="my-team-heading"
        title="My team"
        subtitle={`${total?.name ?? 'Your department'}, ${win.label.toLowerCase()}`}
        action={
          <div className="flex items-center gap-1.5" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <ToggleChip key={p.key} on={period === p.key} onClick={() => setPeriod(p.key)} className="sm:min-h-11 pointer-fine:min-h-8">{p.label}</ToggleChip>
            ))}
          </div>
        }
      />

      {report.isError && !report.data ? (
        <div className="p-4 sm:p-5">
          <InlineError message="Couldn't load your team's scores." onRetry={() => void report.refetch()} />
        </div>
      ) : (
        <>
          {!noScores && (
            <div className="grid grid-cols-2 gap-2 px-4 pt-3 sm:grid-cols-3 sm:px-5">
              <div className="col-span-2 sm:col-span-1">
                <FigureCard
                  label="Team score"
                  help="Everyone's work in this period, completion and compliance counted equally."
                  value={teamScore}
                  tone={figureToneOf(teamScore)}
                  bar={teamScore}
                  loading={loading}
                  format={pctFormat}
                  caption={total ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : undefined}
                />
              </div>
              <FigureCard
                label="Checklists filled"
                help="Share of the team's checklists that came due and were filled."
                value={filled}
                tone={figureToneOf(filled)}
                bar={filled}
                loading={loading}
                format={pctFormat}
                caption={total?.checklist.due ? `${total.checklist.done} of ${total.checklist.due} due` : 'Nothing due yet'}
              />
              <FigureCard
                label="Compliance"
                help="Share of checked answers that were good answers."
                value={compliance}
                tone={figureToneOf(compliance)}
                bar={compliance}
                loading={loading}
                format={pctFormat}
                caption="Good answers"
              />
            </div>
          )}

          {!noScores && (
            <div className="flex flex-wrap items-center justify-between gap-x-2 px-4 pt-3 pb-1 sm:px-5">
              <h3 className="t-card font-display font-bold text-text">Lowest scores at the top</h3>
              <span className="hidden t-meta font-medium text-text-muted sm:block">{`Rank 1 is the best. ${GOOD_FROM} and up is good, ${FAIR_FROM} to ${GOOD_FROM - 1} fair. Tap a name to see their day.`}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading team">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3.5 w-2/3" />
                  </div>
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          ) : worstFirst.length === 0 ? (
            <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
              <EmptyState size="compact" icon={Users} title="Nothing due yet" description="Scores show once your team has work due in this period." />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {worstFirst.slice(0, PREVIEW).map((p) => {
                const rank = rankOf.get(p.id);
                const approved = approvedOf(p);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setOpenPerson(p.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover sm:px-5 cursor-pointer"
                    >
                      <Avatar name={p.name} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="line-clamp-1 t-card font-display font-semibold text-text">{p.name}</span>
                          {rank && <span className="shrink-0 t-meta font-semibold tabular-nums text-text-muted">{rank} of {rankOf.size}</span>}
                        </span>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {p.checklist.due > 0 && <Metric label="Filled" value={p.checklist.completionPct} />}
                          {p.checklist.due > 0 && <Metric label="Compliance" value={p.checklist.compliancePct} />}
                          {p.ticket.due > 0 && <Metric label="Tickets" value={p.ticket.score} />}
                          {p.delegation.due > 0 && <Metric label="Delegations" value={p.delegation.score} />}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {p.overall === null || p.overall === undefined ? (
                          <span className="t-meta font-semibold text-text-muted">Nothing due</span>
                        ) : (
                          <span className={cn('t-stat font-display font-bold tabular-nums leading-none', scoreTone(p.overall))}>{pctText(p.overall)}</span>
                        )}
                        {p.overall !== null && p.overall !== undefined && <ToneChip tone={toneOf(p.overall)} />}
                        {approved !== null && <span className="t-meta font-medium tabular-nums text-text-muted">{pctText(approved)} approved</span>}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
            <Link to={`/admin/scores?${new URLSearchParams({ view: 'person', from: win.from, to }).toString()}`} viewTransition className={FOOT_LINK}>
              <BarChart3 className="size-4" aria-hidden />
              {people.length ? `All ${people.length} scores` : 'All scores'}
            </Link>
            <Link to="/team/fill" viewTransition className={FOOT_LINK}>
              <Grid3x3 className="size-4" aria-hidden />
              Fill chart
            </Link>
            <span className="flex-1" aria-hidden />
            <ExportMenu
              disabled={!people.length}
              aria-label="Export team scores"
              filename="team-scores"
              sheetName="Team scores"
              title={[`${total?.name ?? 'Team'} scores`, `${win.from} to ${to}`]}
              getRows={exportRows}
            />
          </div>
        </>
      )}

      <PersonAttentionSheet userId={openPerson} onClose={() => setOpenPerson(null)} />
    </section>
  );
};
