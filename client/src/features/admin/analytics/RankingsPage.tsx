import { Link, useLocation } from 'react-router';
import { ArrowLeft, Trophy } from 'lucide-react';
import { PageHeader } from '../../../components';
import { AnalyticsControlBar } from './GroupByControl';
import { StoresPerformanceSection } from './StoresPerformanceSection';
import { useAnalyticsRefresh } from './useAnalyticsQueries';
import { useAnalyticsWindow } from './useAnalyticsWindow';

/**
 * The full department and store ranking on a page of its own, with the same time controls as the
 * Overview. It reads the same address (?by=&from=&to=), so opening it from the Overview keeps the
 * period you were looking at.
 */
export const RankingsPage = () => {
  const location = useLocation();
  const { groupBy, range, windowFrom, windowTo, handleGroupBy, handleRange } = useAnalyticsWindow();
  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  return (
    <div className="flex flex-col gap-4 w-full">
      <PageHeader
        icon={Trophy}
        title="Rankings"
        subtitle="Every department and store, best first."
        actions={
          <Link
            to={`/admin${location.search}`}
            className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 rounded-lg border border-border text-sm font-display font-medium text-text-secondary hover:text-text hover:border-border-hover transition-colors"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Overview
          </Link>
        }
      />

      <AnalyticsControlBar
        groupBy={groupBy}
        onGroupByChange={handleGroupBy}
        range={range}
        onRangeChange={handleRange}
        updatedAt={updatedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
      />

      <StoresPerformanceSection from={windowFrom} to={windowTo} />
    </div>
  );
};
