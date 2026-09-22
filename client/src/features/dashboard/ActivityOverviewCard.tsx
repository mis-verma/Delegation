import { BarChart3 } from 'lucide-react';
import { EntityIconTile } from '../../components';
import { Skeleton } from '../../components/skeleton';
import { ActivityTrendChart, ACTIVITY_CHART_HEIGHT } from './ActivityTrendChart';
import { ActivityGroupByControl } from './ActivityGroupByControl';
import { ActivityCategoryFilter } from './ActivityCategoryFilter';
import { ACTIVITY_GROUP_RANGE_LABEL, DASHBOARD_CARD_CLASS, type ActivityGroupBy, type ActivityCategory, type ActivityWorkItem } from './dashboardDisplay';

interface ActivityOverviewCardProps {
  isPending: boolean;
  activityItems: ActivityWorkItem[];
  activeCategories: ReadonlySet<ActivityCategory>;
  onToggleCategory: (category: ActivityCategory) => void;
  activityGroupBy: ActivityGroupBy;
  onGroupByChange: (groupBy: ActivityGroupBy) => void;
}

// Pulled out of HomePage so it can be one entry in the customizable card grid like every other
// dashboard section — it used to be the one inline `<section>` block instead of a component,
// which meant it couldn't be dragged, resized, or addressed by id the way its siblings could.
export const ActivityOverviewCard = ({
  isPending,
  activityItems,
  activeCategories,
  onToggleCategory,
  activityGroupBy,
  onGroupByChange,
}: ActivityOverviewCardProps) => (
  // No overflow-hidden here on purpose — nothing inside needs clipping, and it was cutting off
  // the bar chart's hover tooltip whenever it popped out past this card's own rounded border.
  <section
    aria-labelledby="activity-overview-heading"
    className={`relative @container ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7 overflow-hidden`}
  >
    <div className="absolute -top-24 -right-16 w-56 h-56 bg-primary-500/10 dark:bg-primary-400/5 rounded-full blur-[90px] pointer-events-none" />

    {/* @lg (container), not sm (viewport) — this card can share a row with another half-width
        card, so at a viewport width that would comfortably fit the title/description beside the
        Day/Month/Quarter/Year tabs, the card's own rendered width can be only about half that. */}
    <div className="relative flex flex-col @lg:flex-row @lg:items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <EntityIconTile icon={BarChart3} />
        <div>
          <h2 id="activity-overview-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Activity Overview</h2>
          <p className="text-xs font-medium text-text-muted mt-0.5 tracking-wide">Delegations, tickets, checklists, and todos, over the {ACTIVITY_GROUP_RANGE_LABEL[activityGroupBy]}</p>
        </div>
      </div>
      <ActivityGroupByControl value={activityGroupBy} onChange={onGroupByChange} />
    </div>

    {/* Also scopes the Compliance card's gauges — toggling a category here narrows both, not
        independently. */}
    <div className="relative">
      <ActivityCategoryFilter active={activeCategories} onToggle={onToggleCategory} />
    </div>

    {isPending ? (
      <div className="mt-4 flex flex-col justify-end gap-3" style={{ height: ACTIVITY_CHART_HEIGHT }} role="status" aria-label="Loading activity overview">
        <div className="flex items-end justify-between gap-2 sm:gap-4 h-[190px] px-1">
          {[55, 80, 40, 95, 60, 75, 45].map((h, i) => (
            <Skeleton key={i} className="flex-1 max-w-11 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="flex items-center justify-between px-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-6 rounded" />
          ))}
        </div>
      </div>
    ) : (
      <div className="relative mt-4">
        <ActivityTrendChart items={activityItems} activeCategories={activeCategories} groupBy={activityGroupBy} />
      </div>
    )}
  </section>
);
