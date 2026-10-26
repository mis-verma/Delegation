import { SectionExport } from './ExportRegistry';
import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router';
import { Trophy, AlertTriangle, Building2, Store, ArrowRight } from 'lucide-react';
import { Button, IconChip, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { useOverviewScoreWindow } from './useOverviewScores';
import { scorecardRowHref } from '../../dashboard/scoreDrill';
import { CARD_PAD } from '../../scores/controlStyles';
import { HowCalculated } from '../../scores/HowCalculated';
import { SectionHeader } from '../../scores/SectionHeader';
import { SCORE_LABEL } from '../../../lib/scoreLabels';
import { UpdatingNote } from './UpdatingNote';
import { MIN_RANK_VOLUME, NEEDS_ATTENTION_BELOW, rankRows, useOwnerRankings, type RankedRow } from './useOwnerRankings';
import { formatPercent } from './analyticsDisplay';

interface PerformanceLeadersCardProps {
  from?: string;
  to?: string;
  onViewFull: () => void;
}

type LeaderTone = 'success' | 'danger';

interface LeaderEntryProps {
  icon: typeof Trophy;
  tone: LeaderTone;
  label: string;
  row: RankedRow | null;
  emptyText: string;
  hrefFor: (id: string) => string;
}

const FIGURE_TONE = { success: 'text-success', danger: 'text-danger' } as const;
const BAR_TONE = { success: 'bg-success', danger: 'bg-danger' } as const;

const LeaderEntry = memo(({ icon: Icon, tone, label, row, emptyText, hrefFor }: LeaderEntryProps) => {
  const value = row?.overall ?? null;
  const content = (
    <>
      <span className="flex items-center gap-2">
        <IconChip icon={Icon} tone={tone === 'success' ? 'bg-success' : 'bg-danger'} label={label} soft />
        <span className="flex-1" />
        {row && <span className={`t-card font-display font-bold tabular-nums ${FIGURE_TONE[tone]}`}>{formatPercent(value)}</span>}
      </span>
      {row ? (
        <>
          <span className="block t-card font-display font-semibold leading-snug text-text line-clamp-2">{row.name}</span>
          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
            <span className={`block h-full rounded-full ${BAR_TONE[tone]}`} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
          </span>
        </>
      ) : (
        <span className="block t-meta text-text-muted">{emptyText}</span>
      )}
    </>
  );

  const base = 'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3';
  if (!row) return <div className={base}>{content}</div>;
  return (
    <Link
      viewTransition
      to={hrefFor(row.id)}
      className={`${base} transition-colors duration-150 motion-reduce:transition-none hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50`}
    >
      {content}
    </Link>
  );
});

interface DimensionColumnProps {
  icon: typeof Building2;
  title: string;
  rows: RankedRow[];
  untagged: RankedRow[];
  noun: string;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  hrefFor: (id: string) => string;
  className?: string;
}

const DimensionColumn = ({ icon: Icon, title, rows, untagged, noun, isPending, isError, onRetry, hrefFor, className = '' }: DimensionColumnProps) => {
  const headingId = useId();
  const { top, low, hasEligible, preview } = useMemo(() => {
    const { sorted, topId, lowId } = rankRows(rows);
    return {
      preview: rows.filter((r) => r.overall != null).sort((a, b) => (a.overall as number) - (b.overall as number) || a.name.localeCompare(b.name)).slice(0, 3),
      top: sorted.find((r) => r.id === topId) ?? null,
      low: sorted.find((r) => r.id === lowId) ?? null,
      hasEligible: rows.some((r) => r.overall != null && r.volume >= MIN_RANK_VOLUME),
    };
  }, [rows]);

  return (
    <div role="group" aria-labelledby={headingId} className={`flex min-w-0 flex-1 flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={16} className="text-text-muted" aria-hidden="true" />
        <h3 id={headingId} className="t-card font-display font-bold text-text">{title}</h3>
      </div>
      {isError ? (
        <InlineError message="Could not load this ranking." onRetry={onRetry} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2" role="status" aria-label="Loading the ranking">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
          {(top && low && top.id === low.id) || (!top && low) ? (
            <div className="@md:col-span-2">
              <LeaderEntry icon={((top ?? low)?.overall ?? 100) < NEEDS_ATTENTION_BELOW ? AlertTriangle : Trophy} tone={((top ?? low)?.overall ?? 100) < NEEDS_ATTENTION_BELOW ? 'danger' : 'success'} label="Only one ranked" row={top ?? low} emptyText="" hrefFor={hrefFor} />
            </div>
          ) : !top && !low && !hasEligible ? (
            preview.length > 0 ? (
              <div className="flex flex-col gap-2 @md:col-span-2">
                <p className="t-meta text-text-muted">{`Not ranked yet. Each has fewer than ${MIN_RANK_VOLUME} items in this period. Lowest first.`}</p>
                <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                  {preview.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <Link viewTransition to={hrefFor(r.id)} className="min-w-0 truncate t-card font-display font-semibold text-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-500/40">{r.name}</Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <IconChip icon={false} label={`${r.volume} items`} labelClassName="tabular-nums" />
                        <span className="t-card font-display font-bold tabular-nums text-text">{formatPercent(r.overall)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-lg border border-border px-3 py-3 t-meta text-text-muted @md:col-span-2">
                {untagged.length > 0 && untagged[0].volume > 0
                  ? `${untagged[0].volume} items this period are not linked to any ${noun}, so there is nothing to compare. Link people and checklists to a ${noun} to see them here.`
                  : 'Nothing was due in this period'}
              </p>
            )
          ) : (
            <>
              <LeaderEntry icon={Trophy} tone="success" label="Top" row={top} emptyText="Needs at least two to compare" hrefFor={hrefFor} />
              <LeaderEntry
                icon={AlertTriangle}
                tone="danger"
                label="Needs attention"
                row={low}
                emptyText={hasEligible ? `None below ${NEEDS_ATTENTION_BELOW}%` : 'Not enough data yet'}
                hrefFor={hrefFor}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const PerformanceLeadersCard = ({ from, to, onViewFull }: PerformanceLeadersCardProps) => {
  const headingId = useId();
  const scoreWindow = useOverviewScoreWindow(from, to);
  const dayFrom = scoreWindow?.from;
  const dayTo = scoreWindow?.to;
  const {
    departmentRows, storeRows, departmentUntagged, storeUntagged, departmentsPending, storesPending, departmentsError, storesError,
    retryDepartments, retryStores, updating,
  } = useOwnerRankings(from, to);

  const exportRows = (): TableRows => {
    const out: TableRows[number][] = [['Group', 'Position', 'Name', SCORE_LABEL.overall, 'Tickets closed %', 'Delegations done %', 'Checklists done %', 'Items']];
    for (const [group, rows] of [['Departments', departmentRows], ['Stores', storeRows]] as const) {
      const { sorted, topId, lowId } = rankRows(rows);
      for (const [position, id] of [['Top', topId], ['Needs attention', lowId]] as const) {
        const r = sorted.find((x) => x.id === id);
        if (!r) continue;
        const departments = group === 'Departments';
        out.push([group, position, r.name, exportPct(r.overall), exportPct(r.ticketCompletion), departments ? exportPct(r.secondaryRate) : null, exportPct(departments ? r.checklistRate : r.secondaryRate), r.volume]);
      }
    }
    return out;
  };

  return (
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} @container flex flex-col gap-4 ${CARD_PAD}`}>
      <SectionHeader
        id={headingId}
        level="card"
        title="How stores and departments are doing"
        hint={<HowCalculated figure="overall" />}
        description={`Tickets, delegations and checklists. Needs at least ${MIN_RANK_VOLUME} items to be ranked.`}
        actions={
          <>
            <UpdatingNote show={updating} />
            <Button type="button" variant="ghost" size="sm" onClick={onViewFull}>
              See full ranking
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
            <SectionExport
              disabled={departmentsPending || storesPending}
              aria-label="Export the top and lowest stores and departments"
              filename="overview-leaders"
              sheetName="Leaders"
              title={exportTitle({ what: 'Overview, how stores and departments are doing', from, to })}
              getRows={exportRows}
            />
          </>
        }
      />

      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:gap-6 @2xl:divide-x @2xl:divide-border">
        <DimensionColumn
          icon={Building2}
          title="Departments"
          rows={departmentRows}
          untagged={departmentUntagged}
          noun="department"
          isPending={departmentsPending}
          isError={departmentsError}
          onRetry={retryDepartments}
          hrefFor={(id) => scorecardRowHref('department', id, dayFrom ?? '', dayTo ?? '')}
        />
        <DimensionColumn
          icon={Store}
          title="Stores"
          rows={storeRows}
          untagged={storeUntagged}
          noun="store"
          isPending={storesPending}
          isError={storesError}
          onRetry={retryStores}
          hrefFor={(id) => scorecardRowHref('store', id, dayFrom ?? '', dayTo ?? '')}
          className="@2xl:pl-6"
        />
      </div>
    </section>
  );
};
