import { useMemo } from 'react';
import { useDepartmentsQuery, useStoresQuery } from '../../../tickets/hook';
import { useScoreExplorer } from '../../../scores/useScoreExplorer';
import { useOverviewScoreWindow } from '../useOverviewScores';
import { biLevelParams } from './biParams';
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
  const { data: stores } = useStoresQuery(orgWide);
  const { data: departments } = useDepartmentsQuery(orgWide);
  const storeOptions = useMemo(() => (stores ?? []).map((s) => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => (departments ?? []).map((d) => ({ value: d.id, label: d.name })), [departments]);

  const query = useScoreExplorer(win
    ? biLevelParams(win, route, { view: route.view, parent: route.parent, ancestorStoreId: route.ancestorStoreId })
    : null);

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
        />
      )}
    </div>
  );
};
