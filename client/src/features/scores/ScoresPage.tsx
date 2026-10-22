import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ChevronRight, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../components';
import { Button } from '../../components';
import { useAuth } from '../../context/AuthContext';
import type { ExplorerRow, ExplorerView } from '../../api/scores';
import { exportTitle } from '../../lib/exportTable';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { useDepartmentsQuery, useStoresQuery } from '../tickets/hook';
import { AnalyticsControlBar } from '../admin/analytics/GroupByControl';
import { useAnalyticsRefresh } from '../admin/analytics/useAnalyticsQueries';
import { useSearchPatch } from '../admin/analytics/useAnalyticsWindow';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { CARD_PAD, FIELD_LABEL_CLASS } from './controlStyles';
import { HintPopover } from './HowCalculated';
import { ScoreRowDialog } from './ScoreRowDialog';
import { ScoresFilterBar } from './ScoresFilterBar';
import { ScoresMobileList, ScoresTable } from './ScoresTable';
import { ScoresFillMatrix } from './ScoresFillMatrix';
import { DepartmentStanding } from './DepartmentStanding';
import { ScoresTotalCard, ScoresTotalSkeleton } from './ScoresTotalCard';
import {
  RECURRENCE_OPTIONS, VIEW_LABEL, asTrailItem, exportRowsFor, modulesForFilter, parseModule, parseRecurrence, parseTrail, parseView,
  periodOf, rankById, serializeTrail, sharingLine, sortRows, viewsFor, type SortKey,
} from './scoresDisplay';
import { useScoreExplorer } from './useScoreExplorer';
import { useScoreWindow } from './useScoreWindow';

const PersonDetailSection = lazy(() => import('./PersonDetailSection').then((m) => ({ default: m.PersonDetailSection })));

type ChecklistShow = 'list' | 'matrix';
const SHOW_OPTIONS: readonly ChecklistShow[] = ['list', 'matrix'];
const SHOW_LABEL: Record<ChecklistShow, string> = { list: 'List', matrix: 'Fill matrix' };

export const ScoresPage = () => {
  const { user } = useAuth();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const [params] = useSearchParams();
  const patch = useSearchPatch();
  const win = useScoreWindow();
  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  const trail = useMemo(() => parseTrail(params.get('trail')), [params]);
  const parent = trail[trail.length - 1] ?? null;
  const allowedViews = viewsFor(parent?.kind ?? null, orgWide);
  const defaultView: ExplorerView = 'department';
  const requestedView = parseView(params.get('view'));
  const view: ExplorerView = requestedView && allowedViews.includes(requestedView) ? requestedView : allowedViews.includes(defaultView) ? defaultView : allowedViews[0];

  const storeId = orgWide ? params.get('store') ?? '' : '';
  const departmentId = orgWide ? params.get('dept') ?? '' : '';
  const module = parseModule(params.get('module'));
  const recurrence = module && module !== 'checklist' ? 'all' : parseRecurrence(params.get('rec'));
  const filtered = !!storeId || !!departmentId || !!module || recurrence !== 'all';

  const canMatrix = view === 'checklist' && parent?.kind !== 'person';
  const matrix = canMatrix && params.get('matrix') === '1';

  const ancestorStore = trail.find((t) => t.kind === 'store');
  const query = useScoreExplorer({
    from: win.from,
    to: win.to,
    view,
    storeId: storeId || ancestorStore?.id || undefined,
    departmentId: view === 'store' || parent?.kind === 'person' ? undefined : departmentId || undefined,
    module,
    recurrence,
    parentId: parent?.id,
  });
  const data = query.data;

  const { data: stores } = useStoresQuery(orgWide);
  const { data: departments } = useDepartmentsQuery(orgWide);
  const storeOptions = useMemo(() => (stores ?? []).map((s) => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => (departments ?? []).map((d) => ({ value: d.id, label: d.name })), [departments]);

  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const shownView = data?.view ?? view;
  const modules = useMemo(() => (shownView === 'checklist' ? (['checklist'] as const) : modulesForFilter(module)), [shownView, module]);
  const ranks = useMemo(() => rankById(data?.rows ?? []), [data]);
  const sorted = useMemo(() => sortRows(data?.rows ?? [], sortKey, ascending), [data, sortKey, ascending]);
  const visibleRows = useMemo(() => (data?.unassigned && shownView === 'person' ? [...sorted, data.unassigned] : sorted), [sorted, data, shownView]);
  const openRow = visibleRows.find((r) => `${r.kind}:${r.id}` === openKey) ?? null;

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    else { setSortKey(key); setAscending(true); }
  };

  const setTrail = useCallback((next: typeof trail, nextView?: ExplorerView) => {
    patch({ trail: serializeTrail(next), view: nextView ?? null, matrix: null });
    setOpenKey(null);
  }, [patch]);
  const drill = useCallback((row: ExplorerRow, nextView: ExplorerView) => {
    const item = asTrailItem(row);
    if (!item) return;
    setTrail([...trail, item], nextView);
  }, [setTrail, trail]);
  const goToCrumb = (index: number) => setTrail(trail.slice(0, index + 1), view);
  const goBack = () => setTrail(trail.slice(0, -1), view);

  const changeFilters = (next: { store?: string; dept?: string; module?: string; rec?: string }) => {
    patch({
      ...(next.store !== undefined ? { store: next.store || null } : {}),
      ...(next.dept !== undefined ? { dept: next.dept || null } : {}),
      ...(next.module !== undefined ? { module: next.module || null } : {}),
      ...(next.rec !== undefined ? { rec: next.rec === 'all' ? null : next.rec } : {}),
    });
  };
  const clearFilters = () => patch({ store: null, dept: null, module: null, rec: null });

  const rootLabel = orgWide ? 'Org' : 'Department';
  const nameOfTrail = (item: (typeof trail)[number], isLast: boolean) =>
    item.name || (item.kind === 'department' ? departmentOptions.find((o) => o.value === item.id)?.label : undefined) || (isLast ? data?.parent?.name : undefined) || '...';
  const parentName = parent ? nameOfTrail(parent, true) : '';
  const crumbs = [{ id: 'root', name: rootLabel }, ...trail.map((t, i) => ({ id: t.id, name: nameOfTrail(t, i === trail.length - 1) }))];
  const storeName = storeOptions.find((o) => o.value === storeId)?.label;
  const departmentName = departmentOptions.find((o) => o.value === departmentId)?.label;
  const recurrenceLabel = RECURRENCE_OPTIONS.find((o) => o.value === recurrence)?.label;
  const totalTitle = parent ? parentName : orgWide || data?.scope.allDepartments ? 'Whole organisation' : 'Your department';
  const homeDepartmentId = data?.scope.departmentLocked ? data.scope.departmentId : undefined;
  const sharing = data ? sharingLine(shownView, data.sharing) : null;
  const subjectParent = parent ? { kind: parent.kind, id: parent.id } : data?.scope.departmentLocked && data.scope.departmentId ? { kind: 'department' as const, id: data.scope.departmentId } : { kind: 'org' as const };
  const itemWindow = useMemo(() => ({ from: win.from, to: win.to, period: periodOf(win.from, win.to, win.today) }), [win.from, win.to, win.today]);
  const fillMatrixHref = orgWide ? '/admin/checklist-weekly' : '/checklists/weekly';

  const matrixStoreId = storeId || ancestorStore?.id || '';
  const matrixDepartmentId = departmentId || (parent?.kind === 'department' ? parent.id : '');

  const exportTable = () => exportRowsFor(shownView, visibleRows, ranks, modules);
  const exportMeta = exportTitle({
    what: `Scores by ${VIEW_LABEL[shownView].toLowerCase()}${parent ? `, ${parentName}` : ''}`,
    from: win.from,
    to: win.to,
    period: win.label,
    filters: { Store: storeName, Department: departmentName, Module: module ? MODULE_LABEL[module] : null, 'Checklist kind': recurrence !== 'all' ? recurrenceLabel : null },
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="sr-only">Scores</h1>

      <AnalyticsControlBar
        groupBy="week"
        onGroupByChange={() => undefined}
        hideGroupBy
        range={win.range}
        onRangeChange={win.handleRange}
        updatedAt={updatedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
      />

      <ScoresFilterBar
        stores={orgWide && parent?.kind !== 'store' ? storeOptions : undefined}
        departments={orgWide && !data?.scope.departmentLocked && view !== 'store' && !parent ? departmentOptions : undefined}
        storeId={storeId}
        departmentId={departmentId}
        module={module}
        recurrence={recurrence}
        departmentLockedNote={!!data?.scope.departmentLocked}
        allDepartments={!!data?.scope.allDepartments}
        onChange={changeFilters}
        onClear={clearFilters}
        filtered={filtered}
      />

      {query.isError && !data ? (
        <InlineError message="Could not load the scores." onRetry={() => void query.refetch()} />
      ) : !data ? (
        <>
          <ScoresTotalSkeleton />
          <div className={cn(PANEL_CLASS, 'flex flex-col gap-3', CARD_PAD)} role="status" aria-label="Loading the scores">
            <Skeleton className="h-11 w-full rounded-lg" />
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        </>
      ) : (
        <>
          <ScoresTotalCard total={data.total} modules={modulesForFilter(module)} title={totalTitle} windowLabel={win.label} capped={data.window.capped} />

          {data.scope.allDepartments && homeDepartmentId && shownView === 'department' && !matrix && (
            <DepartmentStanding rows={data.rows} ranks={ranks} homeId={homeDepartmentId} total={data.total} modules={modulesForFilter(module)} />
          )}

          <section aria-label={`By ${VIEW_LABEL[shownView].toLowerCase()}`} className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)}>
            <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1.5">
              {trail.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={goBack} aria-label="Back one level" className="pointer-coarse:min-w-11">
                  <ArrowLeft size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              )}
              {crumbs.map((item, i, all) => {
                const last = i === all.length - 1;
                return (
                  <span key={`${item.id}-${i}`} className="inline-flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-text-light" aria-hidden="true" />}
                    {last ? (
                      <span aria-current="page" className="t-card font-display font-bold text-text">{item.name}</span>
                    ) : (
                      <button type="button" onClick={() => goToCrumb(i - 1)} className="min-h-9 pointer-coarse:min-h-11 rounded-md px-1 t-card font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
                        {item.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={FIELD_LABEL_CLASS}>View as</span>
                <PeriodTabControl value={view} options={allowedViews} labels={VIEW_LABEL} onChange={(v) => patch({ view: v, matrix: null })} fill />
              </div>
              {canMatrix && (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className={FIELD_LABEL_CLASS}>Show as</span>
                  <PeriodTabControl value={matrix ? 'matrix' : 'list'} options={SHOW_OPTIONS} labels={SHOW_LABEL} onChange={(v) => patch({ matrix: v === 'matrix' ? '1' : null })} fill />
                </div>
              )}
              {!matrix && (
                <div className="flex items-center justify-between gap-2 lg:ml-auto lg:justify-end">
                  <p role="status" className="t-meta text-text-muted tabular-nums">{query.updating ? 'Updating' : `${data.rows.length} ${data.rows.length === 1 ? 'row' : 'rows'}`}</p>
                  <ExportMenu
                    disabled={visibleRows.length === 0}
                    aria-label={`Export the scores by ${VIEW_LABEL[shownView].toLowerCase()}`}
                    label={`By ${VIEW_LABEL[shownView].toLowerCase()}`}
                    filename={`scores-${shownView}`}
                    title={exportMeta}
                    getRows={exportTable}
                  />
                </div>
              )}
            </div>

            {sharing && !matrix && (
              <div className="flex items-start gap-1.5">
                <p className="t-meta text-text-secondary">{sharing}</p>
                <HintPopover label="Why the rows can add up to more than the total">
                  <p className="t-card font-display font-bold text-text">Why rows can add up to more</p>
                  <p>A checklist run can have several people on it, or sit across departments. The total counts each run once. A person is scored on every run assigned to them, and a department on every run filed under it, so those rows can add up to more than the total.</p>
                </HintPopover>
              </div>
            )}

            {matrix ? (
              <ScoresFillMatrix
                from={win.from}
                to={win.to}
                today={win.today}
                windowLabel={win.label}
                storeId={matrixStoreId || undefined}
                departmentId={matrixDepartmentId || undefined}
                storeName={storeOptions.find((o) => o.value === matrixStoreId)?.label}
                departmentName={departmentOptions.find((o) => o.value === matrixDepartmentId)?.label}
                filtered={!!storeId || !!departmentId}
                onClearFilters={clearFilters}
              />
            ) : visibleRows.length === 0 ? (
              <EmptyState
                size="compact"
                icon={SearchX}
                title="Nothing was due in this period"
                description={filtered ? 'Try another period, or clear the filters.' : 'Try another period.'}
                action={filtered ? { label: 'Clear filters', onClick: clearFilters } : undefined}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <ScoresMobileList view={shownView} rows={visibleRows} ranks={ranks} modules={modules} scope={data.scope} onOpen={(r) => setOpenKey(`${r.kind}:${r.id}`)} />
                <ScoresTable
                  view={shownView}
                  rows={visibleRows}
                  ranks={ranks}
                  modules={modules}
                  sortKey={sortKey}
                  ascending={ascending}
                  onSort={sortBy}
                  onOpen={(r) => setOpenKey(`${r.kind}:${r.id}`)}
                  onDrill={drill}
                  scope={data.scope}
                  caption={`Scores by ${VIEW_LABEL[shownView].toLowerCase()}, ${win.label}`}
                />
              </div>
            )}

            {shownView === 'checklist' && !matrix && (
              <p className="t-meta text-text-muted">
                Want to see who filled what, day by day? {canMatrix ? 'Switch to Fill matrix above, or open the' : 'Open the'}{' '}
                <Link viewTransition to={fillMatrixHref} className="font-display font-semibold text-text underline-offset-2 hover:underline">Fill report</Link>
              </p>
            )}
          </section>

          {parent?.kind === 'person' && (
            <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
              <PersonDetailSection personId={parent.id} personName={parentName} departmentFromTrail={trail.find((t) => t.kind === 'department')?.id} total={data.total} from={win.from} to={win.to} windowLabel={win.label} />
            </Suspense>
          )}

          <details className={cn(PANEL_CLASS, 'px-4 py-2')}>
            <summary className="flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center t-meta font-display font-semibold text-text-secondary">What is counted</summary>
            <ul className="flex flex-col gap-1.5 pb-2 pt-1">
              {data.notes.map((n) => <li key={n} className="t-meta text-text-muted">{n}</li>)}
            </ul>
          </details>

          {orgWide && (
            <p className="t-meta text-text-muted">
              Numbers don&apos;t add up?{' '}
              <Link viewTransition to={`/admin/data-check?from=${win.from}&to=${win.to}`} className="font-display font-semibold text-text underline-offset-2 hover:underline">Open data check</Link>
            </p>
          )}
        </>
      )}

      <ScoreRowDialog
        row={openRow}
        modules={openRow?.kind === 'checklist' ? ['checklist'] : modules}
        windowLabel={win.label}
        window={itemWindow}
        orgWide={orgWide}
        parentSubject={subjectParent}
        scope={data?.scope}
        onClose={() => setOpenKey(null)}
        onDrill={drill}
      />
    </div>
  );
};
