import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hand, Timer, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, InlineError, PageBackButton, PageHeader, SlidingTabs, Skeleton, type SlidingTabOption } from '../../../components';
import { TABLE_FRAME_CLASS, TD_CLASS, TH_CLASS, TR_CLASS } from '../../../components/dataTable';
import { PANEL_CLASS } from '../../../components/entityCard';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { ticketApi, type TatLegNumbers, type TatLegRow } from '../../../api/ticket';

type Group = 'people' | 'departments';

const GROUP_OPTIONS: readonly SlidingTabOption<Group>[] = [
  { value: 'people', label: 'People' },
  { value: 'departments', label: 'Departments' },
];

const DAYS: readonly { value: string; label: string; shortLabel: string }[] = [
  { value: '30', label: 'Last 30 days', shortLabel: '30d' },
  { value: '90', label: 'Last 90 days', shortLabel: '90d' },
  { value: '365', label: 'Last year', shortLabel: '1y' },
];

const hours = (value: number | null): string => {
  if (value === null) return '—';
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 24) return `${Math.round(value * 10) / 10}h`;
  return `${Math.round((value / 24) * 10) / 10}d`;
};

const toneOf = (pct: number | null): string => {
  if (pct === null) return 'text-text-muted';
  if (pct >= 40) return 'text-danger';
  if (pct >= 15) return 'text-warning';
  return 'text-success';
};

const LegCell = ({ leg }: { leg: TatLegNumbers }) => (
  <span className="flex flex-col">
    <span className="font-figure font-bold tabular-nums text-text">{hours(leg.avgHours)}</span>
    <span className={cn('t-meta font-display font-semibold tabular-nums', toneOf(leg.breachPct))}>
      {leg.measured === 0 ? 'Nothing measured' : `${leg.breaches} of ${leg.measured} late`}
    </span>
  </span>
);

const LegTile = ({ label, icon: Icon, tone, leg }: { label: string; icon: typeof Hand; tone: string; leg: TatLegNumbers }) => (
  <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-2">
    <span className="flex items-center gap-1.5">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone)} aria-hidden="true">
        <Icon className="size-3" strokeWidth={2.5} />
      </span>
      <span className="truncate t-meta font-display font-semibold text-text-secondary">{label}</span>
    </span>
    <LegCell leg={leg} />
  </span>
);

const totalsOf = (rows: readonly TatLegRow[]) => ({
  people: rows.length,
  hodBreaches: rows.reduce((total, r) => total + r.hod.breaches, 0),
  userBreaches: rows.reduce((total, r) => total + r.user.breaches, 0),
});

export const TatLegReportPage = () => {
  const [group, setGroup] = useState<Group>('people');
  const [days, setDays] = useState('30');

  const report = useQuery({
    queryKey: ['tickets', 'tat-legs', days] as const,
    queryFn: () => ticketApi.getTatLegReport(new Date(Date.now() - Number(days) * 86_400_000).toISOString()).then((r) => r.data),
    retry: handleQueryRetry,
    staleTime: 60_000,
  });

  const rows = group === 'people' ? report.data?.people ?? [] : report.data?.departments ?? [];
  const totals = totalsOf(rows);

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-4 pt-2.5">
      <PageBackButton />
      <PageHeader
        icon={Timer}
        title="Turnaround breaches"
        subtitle={report.data
          ? `Head target ${report.data.hodTargetHours}h from raised to assigned. A person's clock runs from their claim to hand-in.`
          : 'Head time and person time, counted separately.'}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SlidingTabs label="Group by" value={group} options={GROUP_OPTIONS} onChange={setGroup} size="sm" fill="phone" className="min-w-0 flex-1 sm:flex-none" />
        <SlidingTabs label="Period" value={days} options={DAYS} onChange={setDays} size="sm" fill="phone" className="min-w-0 flex-1 sm:flex-none" />
      </div>

      {report.isError ? (
        <InlineError message="Couldn't load the turnaround numbers." onRetry={() => void report.refetch()} />
      ) : report.isPending ? (
        <div className={cn(PANEL_CLASS, 'flex flex-col divide-y divide-border/60 overflow-hidden')}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20 max-sm:hidden" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Timer} title="Nothing to measure yet" description="No ticket in this period was assigned by a head or claimed and handed in." />
      ) : (
        <>
          <p className="t-meta font-display text-text-muted">
            {totals.people} {group === 'people' ? (totals.people === 1 ? 'person' : 'people') : totals.people === 1 ? 'department' : 'departments'}
            {' · '}{totals.hodBreaches} head {totals.hodBreaches === 1 ? 'breach' : 'breaches'}
            {' · '}{totals.userBreaches} person {totals.userBreaches === 1 ? 'breach' : 'breaches'}
          </p>

          <ul className="flex flex-col gap-2 sm:hidden">
            {rows.map((row) => (
              <li key={row.id} className={cn(PANEL_CLASS, 'flex flex-col gap-2 p-3')}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate t-card font-display font-bold text-text">{row.name}</span>
                  {row.departmentName && row.departmentName !== row.name && (
                    <span className="truncate t-meta text-text-muted">{row.departmentName}</span>
                  )}
                </span>
                <span className="flex gap-2">
                  <LegTile label="Head" icon={Hand} tone="bg-vivid-blue" leg={row.hod} />
                  <LegTile label="Person" icon={UserCheck} tone="bg-vivid-green" leg={row.user} />
                </span>
              </li>
            ))}
          </ul>

          <div className={cn(TABLE_FRAME_CLASS, 'max-sm:hidden')}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH_CLASS}>{group === 'people' ? 'Person' : 'Department'}</th>
                  <th className={TH_CLASS}>Head: raised to assigned</th>
                  <th className={TH_CLASS}>Person: claim to hand-in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={TR_CLASS}>
                    <td className={TD_CLASS}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-display font-semibold text-text">{row.name}</span>
                        {row.departmentName && row.departmentName !== row.name && (
                          <span className="truncate t-meta text-text-muted">{row.departmentName}</span>
                        )}
                      </span>
                    </td>
                    <td className={TD_CLASS}><LegCell leg={row.hod} /></td>
                    <td className={TD_CLASS}><LegCell leg={row.user} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
