import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useDepartmentsQuery, useStoresQuery } from '../../../tickets/hook';
import { useScoreExplorer } from '../../../scores/useScoreExplorer';
import { useOverviewScoreWindow } from '../useOverviewScores';
import { useSearchPatch } from '../useAnalyticsWindow';
import { rowValue } from './biMetrics';
import { biLevelParams } from './biParams';
import { previousWindow } from './biTimeUtils';
import { BiPanel } from './BiPanel';
import { ModuleCarousel } from './ModuleCarousel';
import { useBiPrefs } from './useBiPrefs';
import { useBiRoute } from './useBiRoute';

interface BiOverviewProps {
  windowFrom?: string;
  windowTo?: string;
  orgWide: boolean;
}

export const BiOverview = ({ windowFrom, windowTo, orgWide }: BiOverviewProps) => {
  const route = useBiRoute(orgWide);
  const prefs = useBiPrefs();
  const win = useOverviewScoreWindow(windowFrom, windowTo);
  const [params] = useSearchParams();
  const patch = useSearchPatch();
  const { data: stores } = useStoresQuery(orgWide);
  const { data: departments } = useDepartmentsQuery(orgWide);
  const storeOptions = useMemo(() => (stores ?? []).map((s) => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => (departments ?? []).map((d) => ({ value: d.id, label: d.name })), [departments]);

  const level = useMemo(
    () => ({ view: route.view, parent: route.parent, ancestorStoreId: route.ancestorStoreId }),
    [route.view, route.parent, route.ancestorStoreId],
  );
  const query = useScoreExplorer(win ? biLevelParams(win, route, level) : null);

  const comparing = prefs.compare && (prefs.chart === 'bars' || prefs.chart === 'rings');
  const priorWindow = win && comparing ? previousWindow(win.from, win.to) : null;
  const priorQuery = useScoreExplorer(priorWindow ? biLevelParams(priorWindow, route, level) : null);
  const measure = route.module === 'all' ? 'score' : prefs.measure;
  const previous = useMemo(() => {
    if (!comparing || !priorQuery.data) return undefined;
    const rows = priorQuery.data.unassigned ? [...priorQuery.data.rows, priorQuery.data.unassigned] : priorQuery.data.rows;
    return new Map(rows.map((r) => [r.id, rowValue(r, route.module, measure)]));
  }, [comparing, priorQuery.data, route.module, measure]);

  const zoomFrom = params.get('zf');
  const zoomTo = params.get('zt');
  const zoomed = !!zoomFrom && !!zoomTo;

  const onZoom = useCallback((bucket: { from: string; to: string }) => {
    patch({ from: bucket.from, to: bucket.to, range: null, ...(zoomed || !win ? {} : { zf: win.from, zt: win.to }) });
  }, [patch, zoomed, win]);

  const onResetZoom = useCallback(() => {
    patch({ from: zoomFrom, to: zoomTo, zf: null, zt: null, range: null });
  }, [patch, zoomFrom, zoomTo]);

  return (
    <div className="flex flex-col gap-3">
      <ModuleCarousel total={query.data?.total} selected={route.module} onSelect={route.setModule} updating={query.updating} />
      {win && (
        <BiPanel
          route={route}
          prefs={prefs}
          query={query}
          win={win}
          orgWide={orgWide}
          storeOptions={storeOptions}
          departmentOptions={departmentOptions}
          previous={previous}
          zoomed={zoomed}
          onZoom={onZoom}
          onResetZoom={onResetZoom}
        />
      )}
    </div>
  );
};
