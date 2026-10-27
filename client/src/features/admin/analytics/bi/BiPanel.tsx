import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpNarrowWide, ChevronRight, ExternalLink, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow, ExplorerView } from '../../../../api/scores';
import { Button, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../../components';
import { exportTitle } from '../../../../lib/exportTable';
import { formatPct, roundPct } from '../../../../lib/percent';
import { toneOf, TONE_TEXT } from '../../../dashboard/scoreTone';
import { VIEW_LABEL, exportRowsFor, rankById, serializeTrail, sharingLine } from '../../../scores/scoresDisplay';
import { scoreExplorerQuery, type useScoreExplorer } from '../../../scores/useScoreExplorer';
import { BarRows } from './BarRows';
import { BI_MEASURES, BI_MODULES, blockValue, measureLabel, moduleTitle, rowValue, sortBiRows } from './biMetrics';
import { Segmented } from './Segmented';
import { biLevelParams } from './biParams';
import { BiFilters } from './BiFilters';
import { BiTrend, type BiTrendTarget } from './BiTrend';
import type { useBiPrefs, BiTopN } from './useBiPrefs';
import type { BiRoute } from './useBiRoute';

const TOP_OPTIONS: readonly { value: `${BiTopN}`; label: string }[] = [
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
  { value: '0', label: 'All' },
];

interface BiPanelProps {
  route: BiRoute;
  prefs: ReturnType<typeof useBiPrefs>;
  query: ReturnType<typeof useScoreExplorer>;
  win: { from: string; to: string; label: string };
  orgWide: boolean;
  storeOptions: { value: string; label: string }[];
  departmentOptions: { value: string; label: string }[];
}

export const BiPanel = ({ route, prefs, query, win, orgWide, storeOptions, departmentOptions }: BiPanelProps) => {
  const { module, view, allowedViews, trail, parent, storeId, departmentId, ancestorStoreId, setView, setFilters, clearFilters, drill, goToCrumb, goBack, goRoot } = route;
  const headingId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = query.data;
  const measure = module === 'all' ? 'score' : prefs.measure;
  const shownView: ExplorerView = data?.view ?? view;

  const scope = `${view}|${parent?.id ?? ''}|${module}`;
  const [sel, setSel] = useState<{ scope: string; key: string | null }>({ scope: '', key: null });
  const selectedKey = sel.scope === scope ? sel.key : null;

  const sorted = useMemo(() => {
    if (!data) return [];
    const base = shownView === 'person' && data.unassigned ? [...data.rows, data.unassigned] : data.rows;
    return sortBiRows(base, module, measure, prefs.lowestFirst);
  }, [data, shownView, module, measure, prefs.lowestFirst]);

  const scored = useMemo(() => sorted.filter((r) => rowValue(r, module, measure) !== null), [sorted, module, measure]);
  const idleCount = sorted.length - scored.length;
  const visible = prefs.topN === 0 ? scored : scored.slice(0, prefs.topN);
  const hiddenCount = scored.length - visible.length;

  const prefetch = (row: ExplorerRow, nextView: ExplorerView) => {
    if (row.kind !== 'department' && row.kind !== 'store' && row.kind !== 'person') return;
    void queryClient.prefetchQuery(scoreExplorerQuery(biLevelParams(
      win,
      { storeId, departmentId },
      { view: nextView, parent: { id: row.id, kind: row.kind }, ancestorStoreId: row.kind === 'store' ? row.id : ancestorStoreId },
    )));
  };

  const trendTarget: BiTrendTarget = parent
    ? { scope: parent.kind, id: parent.id }
    : departmentId
      ? { scope: 'department', id: departmentId }
      : storeId
        ? { scope: 'store', id: storeId }
        : data?.scope.departmentLocked && data.scope.departmentId
          ? { scope: 'department', id: data.scope.departmentId }
          : { scope: 'org' };

  const showStoreFilter = orgWide && parent?.kind !== 'store' && storeOptions.length > 0;
  const showDepartmentFilter = orgWide && !data?.scope.departmentLocked && shownView !== 'store' && !parent && departmentOptions.length > 0;

  const scopesHref = `/admin/scores?${new URLSearchParams({
    from: win.from,
    to: win.to,
    view: shownView,
    ...(serializeTrail(trail) ? { trail: serializeTrail(trail) as string } : {}),
    ...(module !== 'all' ? { module } : {}),
    ...(storeId ? { store: storeId } : {}),
    ...(departmentId ? { dept: departmentId } : {}),
  }).toString()}`;

  const exportModules = module === 'all' ? BI_MODULES : [module];
  const crumbs = [{ name: orgWide ? 'Organisation' : 'Department' }, ...trail.map((t) => ({ name: t.name }))];
  const title = `${VIEW_LABEL[shownView]}${parent ? ` in ${parent.name}` : ''}`;
  const showTiles = module !== 'all' && !!data;
  const sharing = data ? sharingLine(shownView, data.sharing) : null;

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {allowedViews.length > 1 && (
        <Segmented label="Group by" options={allowedViews.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} value={shownView} onChange={setView} />
      )}
      {module !== 'all' && (
        <Segmented
          className={cn(showTiles && 'xl:hidden')}
          label="Measure"
          options={BI_MEASURES.map((m) => ({ value: m, label: measureLabel(m, module) }))}
          value={prefs.measure}
          onChange={prefs.setMeasure}
        />
      )}
      <Segmented label="How many to show" options={TOP_OPTIONS} value={`${prefs.topN}`} onChange={(v) => prefs.setTopN(Number(v) as BiTopN)} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => prefs.setLowestFirst(!prefs.lowestFirst)}
        className="pointer-coarse:min-h-11"
        aria-label={prefs.lowestFirst ? 'Sorted lowest first. Switch to highest first' : 'Sorted highest first. Switch to lowest first'}
      >
        {prefs.lowestFirst ? <ArrowUpNarrowWide size={14} aria-hidden="true" /> : <ArrowDownWideNarrow size={14} aria-hidden="true" />}
        {prefs.lowestFirst ? 'Lowest first' : 'Highest first'}
      </Button>
    </div>
  );

  const body = query.isError && !data ? (
    <InlineError message="Could not load the scores." onRetry={() => void query.refetch()} />
  ) : !data ? (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading the bars">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
    </div>
  ) : scored.length === 0 ? (
    <EmptyState
      icon={SearchX}
      title="Nothing was due here"
      description={`No ${moduleTitle(module).toLowerCase()} fell due in ${win.label}. Pick another module or a wider period.`}
    />
  ) : (
    <div className={cn('flex flex-col gap-2', query.updating && 'opacity-70 transition-opacity')} aria-busy={query.updating}>
      <BarRows
        rows={visible}
        module={module}
        measure={measure}
        selectedKey={selectedKey}
        onSelect={(key) => setSel({ scope, key })}
        onDrill={drill}
        onIntent={prefetch}
      />
      {hiddenCount > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={() => prefs.setTopN(0)} className="self-center pointer-coarse:min-h-11">
          Show all {scored.length}
        </Button>
      )}
      {idleCount > 0 && (
        <p className="t-meta font-medium text-text-muted">
          {idleCount} {idleCount === 1 ? 'row has' : 'rows have'} nothing due for {moduleTitle(module).toLowerCase()} and {idleCount === 1 ? 'is' : 'are'} left out.
        </p>
      )}
      {sharing && <p className="t-meta font-medium text-text-muted">{sharing}</p>}
    </div>
  );

  return (
    <section aria-labelledby={headingId} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 sm:p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="t-section font-display font-bold text-text">{title}</h2>
          <p className="t-meta font-medium text-text-muted">{moduleTitle(module)} · {measureLabel(measure, module)} · {win.label}</p>
        </div>
        <div className="flex items-center gap-1">
          <ExportMenu
            disabled={sorted.length === 0}
            aria-label={`Export ${title}`}
            filename={`overview-${shownView}`}
            sheetName="Overview"
            title={exportTitle({ what: `Overview by ${VIEW_LABEL[shownView].toLowerCase()}${parent ? `, ${parent.name}` : ''}`, from: win.from, to: win.to, period: win.label, filters: { Module: module === 'all' ? null : moduleTitle(module) } })}
            getRows={() => exportRowsFor(shownView, sorted, rankById(sorted), exportModules)}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => void navigate(scopesHref, { viewTransition: true })} className="pointer-coarse:min-h-11">
            Scores
            <ExternalLink size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {trail.length > 0 && (
        <nav aria-label="Where you are" className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={goBack} className="shrink-0 pointer-coarse:min-h-11" aria-label="Go up one level">
            <ArrowLeft size={14} aria-hidden="true" />
            Back
          </Button>
          <ol className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${c.name}-${i}`} className="flex shrink-0 items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 text-text-muted" aria-hidden="true" />}
                  {last ? (
                    <span aria-current="page" className="t-meta font-display font-bold text-text">{c.name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => (i === 0 ? goRoot() : goToCrumb(i - 1))}
                      className="min-h-8 rounded-md px-1.5 t-meta font-display font-semibold text-primary-700 outline-none cursor-pointer hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11 dark:text-primary-300"
                    >
                      {c.name}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <BiFilters
        stores={showStoreFilter ? storeOptions : undefined}
        departments={showDepartmentFilter ? departmentOptions : undefined}
        storeId={storeId}
        departmentId={departmentId}
        onChange={setFilters}
        onClear={clearFilters}
      />

      {controls}

      <div className={cn('grid gap-4', showTiles && 'xl:grid-cols-[minmax(0,1fr)_18rem]')}>
        <div className="min-w-0">{body}</div>
        {module !== 'all' && data && (
          <div className="hidden flex-col gap-2 xl:flex" role="group" aria-label={`${moduleTitle(module)}, choose a measure`}>
            <h3 className="t-meta font-display font-bold text-text-muted">{parent ? parent.name : orgWide ? 'Whole organisation' : 'Your department'}</h3>
            {BI_MEASURES.map((m) => {
              const value = blockValue(data.total[module], m);
              const tone = toneOf(value);
              const active = prefs.measure === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => prefs.setMeasure(m)}
                  className={cn(
                    'flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 py-2.5 text-left outline-none transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/50',
                    active ? 'border-primary-500/60 ring-2 ring-primary-500/20' : 'border-border hover:border-border-hover',
                  )}
                >
                  <span className="t-card font-display font-semibold text-text">{measureLabel(m, module)}</span>
                  <span className={cn('t-stat font-display font-extrabold tabular-nums', TONE_TEXT[tone])}>
                    {roundPct(value) === null ? 'N/A' : formatPct(value)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {data && scored.length > 0 && <BiTrend target={trendTarget} from={win.from} to={win.to} module={module} measure={measure} />}
    </section>
  );
};
