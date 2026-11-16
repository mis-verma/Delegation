import { useId } from 'react';
import { SlidingTabs, type SlidingTabOption } from '../../components';
import { HomeStats, type StatScope } from './HomeStats';
import { STATS_VIEW_SCHEMA, type StatsView } from './work/statsRegistry';
import type { ApprovalFigure } from './approvalFigures';
import type { DashboardSummaries } from './useDashboardSummaries';

interface NumbersTodaySectionProps {
  view: StatsView;
  scope: StatScope;
  teamLabel: string;
  kpi: DashboardSummaries['kpi'];
  approval?: ApprovalFigure;
  scopeOptions?: readonly SlidingTabOption<StatScope>[];
  onScopeChange?: (scope: StatScope) => void;
}

export const NumbersTodaySection = ({ view, scope, teamLabel, kpi, approval, scopeOptions, onScopeChange }: NumbersTodaySectionProps) => {
  const headingId = useId();
  const stats = <HomeStats kpi={kpi} scope={scope} teamLabel={teamLabel} view={view} approval={scope === 'mine' ? undefined : approval} />;
  if (!scopeOptions || !onScopeChange) return stats;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={headingId} className="t-section font-display font-bold text-text">{STATS_VIEW_SCHEMA[view].heading}</h2>
        <SlidingTabs label="Whose numbers to show" value={scope} options={scopeOptions} onChange={onScopeChange} size="sm" fill="phone" className="max-sm:w-full" />
      </div>
      {stats}
    </section>
  );
};
