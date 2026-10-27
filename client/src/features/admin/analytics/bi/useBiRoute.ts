import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { ExplorerRow, ExplorerView } from '../../../../api/scores';
import { asTrailItem, parseTrail, parseView, serializeTrail, viewsFor, type TrailItem } from '../../../scores/scoresDisplay';
import { useSearchPatch } from '../useAnalyticsWindow';
import { parseBiModule, type BiModule } from './biMetrics';

export const useBiRoute = (orgWide: boolean) => {
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const trailParam = params.get('trail');
  const trail = useMemo(() => parseTrail(trailParam), [trailParam]);
  const parent = trail[trail.length - 1] ?? null;
  const ancestorStoreId = trail.find((t) => t.kind === 'store')?.id;
  const module = parseBiModule(params.get('module'));
  const storeId = orgWide ? params.get('store') ?? '' : '';
  const departmentId = orgWide ? params.get('dept') ?? '' : '';

  const allowedViews = useMemo<ExplorerView[]>(() => viewsFor(parent?.kind ?? null, orgWide).filter((v) => v !== 'module'), [parent?.kind, orgWide]);
  const defaultView: ExplorerView = orgWide ? 'department' : 'person';
  const requested = parseView(params.get('view'));
  const view: ExplorerView = requested && allowedViews.includes(requested) ? requested : allowedViews.includes(defaultView) ? defaultView : allowedViews[0];

  const setModule = useCallback((next: BiModule) => patch({ module: next === 'all' ? null : next }), [patch]);
  const setView = useCallback((next: ExplorerView) => patch({ view: next }), [patch]);
  const setFilters = useCallback((next: { store?: string; dept?: string }) => patch({
    ...(next.store !== undefined ? { store: next.store || null } : {}),
    ...(next.dept !== undefined ? { dept: next.dept || null } : {}),
  }), [patch]);
  const clearFilters = useCallback(() => patch({ store: null, dept: null }), [patch]);

  const setTrail = useCallback((next: readonly TrailItem[], nextView?: ExplorerView) => {
    patch({ trail: serializeTrail(next), view: nextView ?? null });
  }, [patch]);

  const drill = useCallback((row: ExplorerRow, nextView: ExplorerView) => {
    const item = asTrailItem(row);
    if (item) setTrail([...trail, item], nextView);
  }, [setTrail, trail]);

  const goToCrumb = useCallback((index: number) => setTrail(trail.slice(0, index + 1)), [setTrail, trail]);
  const goBack = useCallback(() => setTrail(trail.slice(0, -1)), [setTrail, trail]);
  const goRoot = useCallback(() => setTrail([]), [setTrail]);

  return {
    module, view, allowedViews, trail, parent, ancestorStoreId, storeId, departmentId,
    setModule, setView, setFilters, clearFilters, drill, goToCrumb, goBack, goRoot,
  };
};

export type BiRoute = ReturnType<typeof useBiRoute>;
