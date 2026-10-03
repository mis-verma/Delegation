import { memo } from 'react';
import { CheckSquare, TicketCheck, ClipboardCheck, ListTodo, type LucideIcon } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { ACTIVITY_CATEGORY_ORDER, ACTIVITY_CATEGORY_LABEL, ACTIVITY_CATEGORY_DOT_CLASS, type ActivityCategory } from './dashboardDisplay';

interface ActivityCategoryFilterProps {
  active: ReadonlySet<ActivityCategory>;
  onToggle: (category: ActivityCategory) => void;
  /** Optional "Org" or "Mine" tag shown beside each category it is given a value for. */
  scope?: Partial<Record<ActivityCategory, 'org' | 'mine'>>;
}

// Same solid-icon-circle-in-a-bordered-pill language as the Calendar page's own legend (and
// IconChip's other callers — StatusChip, PriorityChip, DepartmentChip, TagChip). Reuses the exact
// same sidebar-nav glyphs Calendar's legend already picked for Delegation/Ticket/Checklist, plus
// ListTodo for the one category Calendar doesn't have.
const ACTIVITY_CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  delegation: CheckSquare,
  ticket: TicketCheck,
  checklist: ClipboardCheck,
  todo: ListTodo,
};

// One filter, shared by the bar chart and the compliance gauges below it — toggling a category
// here changes both at once, instead of each widget needing its own copy of this control.
export const ActivityCategoryFilter = memo(({ active, onToggle, scope }: ActivityCategoryFilterProps) => (
  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter activity by category">
    {/* These chips carry the chart's only colour key — each icon's tone is the exact fill of that
        category's segment in the stacked bars. */}
    <span className="text-xs font-display font-semibold text-text-muted tracking-wide">Showing</span>
    {ACTIVITY_CATEGORY_ORDER.map((category) => {
      const isActive = active.has(category);
      const scopeTag = scope?.[category];
      return (
        <button
          key={category}
          type="button"
          onClick={() => onToggle(category)}
          aria-pressed={isActive}
          className={`inline-flex items-center gap-1.5 rounded-full outline-none transition-opacity duration-200 cursor-pointer pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
            isActive ? 'opacity-100' : 'opacity-50 hover:opacity-90'
          }`}
        >
          <IconChip
            icon={ACTIVITY_CATEGORY_ICON[category]}
            tone={ACTIVITY_CATEGORY_DOT_CLASS[category]}
            label={ACTIVITY_CATEGORY_LABEL[category]}
          />
          {scopeTag && (
            <span className="text-xs font-display font-semibold text-text-muted pr-1">
              {scopeTag === 'org' ? 'Org' : 'Mine'}
            </span>
          )}
        </button>
      );
    })}
  </div>
));
ActivityCategoryFilter.displayName = 'ActivityCategoryFilter';
