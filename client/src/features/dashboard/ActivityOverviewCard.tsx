import { memo } from 'react';
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
  /** "Org" or "Mine" tag per category. Defaults to Mine for all four: this card is fed the
   *  signed-in user's own work. */
  categoryScope?: Partial<Record<ActivityCategory, 'org' | 'mine'>>;
}

const DEFAULT_SCOPE: Record<ActivityCategory, 'org' | 'mine'> = {
  delegation: 'mine',
  ticket: 'mine',
  checklist: 'mine',
  todo: 'mine',
};

const SKELETON_BAR_HEIGHTS = [55, 80, 40, 95, 60, 75, 45];

// Pulled out of HomePage so it can be one entry in the customizable card grid like every other
// dashboard section. No overflow-hidden here on purpose — nothing inside needs clipping, and it
// would cut off the bar chart's hover tooltip where it pops out past this card's own border.
export const ActivityOverviewCard = memo(({
  isPending,
  activityItems,
  activeCategories,
  onToggleCategory,
  activityGroupBy,
  onGroupByChange,
  categoryScope,
}: ActivityOverviewCardProps) => {
  const scope = { ...DEFAULT_SCOPE, ...categoryScope };
  const allMine = Object.values(scope).every((s) => s === 'mine');
  return (
  <section
    aria-labelledby="activity-overview-heading"
    className={`relative @container flex flex-col gap-4 ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7`}
  >
    {/* @lg (container), not sm (viewport) — this card can share a row with another half-width
        card, so at a viewport width that would comfortably fit the title/description beside the
        Day/Month/Quarter/Year tabs, the card's own rendered width can be only about half that. */}
    <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <EntityIconTile icon={BarChart3} />
        <div>
          <h2 id="activity-overview-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Items created</h2>
          {/* Shown on every screen size: it says what the bars count (items created in the
              window, not items finished) and whose work it is. */}
          <p className="text-xs font-medium text-text-muted mt-0.5">{allMine ? 'Your delegations' : 'Delegations'}, tickets, checklists and todos created in the {ACTIVITY_GROUP_RANGE_LABEL[activityGroupBy]}</p>
        </div>
      </div>
      <ActivityGroupByControl value={activityGroupBy} onChange={onGroupByChange} />
    </div>

    {/* Category filter is desktop-only — every category starts on, and on a phone the chart itself
        is the thing worth seeing, not four toggle chips stacked above it. Also scopes the
        Completion and on-time card's gauges: toggling a category here narrows both. */}
    <div className="hidden sm:block">
      <ActivityCategoryFilter active={activeCategories} onToggle={onToggleCategory} scope={scope} />
    </div>

    {isPending ? (
      <div className="flex flex-col justify-end gap-3" style={{ height: ACTIVITY_CHART_HEIGHT }} role="status" aria-label="Loading items created">
        <div aria-hidden="true" className="flex flex-col justify-end gap-3 h-full">
          <div className="flex items-end justify-between gap-2 sm:gap-4 h-[190px] px-1">
            {SKELETON_BAR_HEIGHTS.map((h, i) => (
              <Skeleton key={i} className="flex-1 max-w-11 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex items-center justify-between px-1">
            {SKELETON_BAR_HEIGHTS.map((_, i) => (
              <Skeleton key={i} className="h-3 w-6 rounded" />
            ))}
          </div>
        </div>
      </div>
    ) : (
      <ActivityTrendChart items={activityItems} activeCategories={activeCategories} groupBy={activityGroupBy} onToggleCategory={onToggleCategory} />
    )}
  </section>
  );
});
ActivityOverviewCard.displayName = 'ActivityOverviewCard';
