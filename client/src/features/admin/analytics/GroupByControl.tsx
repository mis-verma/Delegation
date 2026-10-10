import { memo, useState, type ReactNode } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, DateRangePicker, type DateRangeValue } from '../../../components';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { ANALYTICS_LOCALE, defaultWindowLabel, toDateParam } from './analyticsDisplay';

export type GroupBy = 'day' | 'week' | 'month' | 'year';

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

interface GroupByControlProps {
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
  /** Leaves the date picker out, for a caller that lays the range controls out itself. */
  hideRange?: boolean;
}

// The picker reports {from, to: null} on the first tap of a two-tap pick. Callers must never see
// that half-finished range (a query with only a start date silently runs to "now"), so the draft
// stays inside this control and only a complete range, or a cleared one, is passed up.
const useCompleteRangeOnly = (range: DateRangeValue, onRangeChange: (range: DateRangeValue) => void) => {
  const [draft, setDraft] = useState<{ base: DateRangeValue; value: DateRangeValue } | null>(null);
  // A draft started against an older range is stale once the range changes from outside.
  const shown = draft && draft.base === range ? draft.value : range;

  const handleChange = (next: DateRangeValue) => {
    if (next.from && next.to) {
      setDraft(null);
      onRangeChange(next);
    } else if (!next.from && !next.to) {
      setDraft(null);
      onRangeChange({ from: null, to: null });
    } else {
      setDraft({ base: range, value: next });
    }
  };

  return { shown, handleChange };
};

const GroupByTabs = memo(({ groupBy, onGroupByChange }: Pick<GroupByControlProps, 'groupBy' | 'onGroupByChange'>) => (
  <Tabs value={groupBy} onValueChange={(v) => onGroupByChange(v as GroupBy)}>
    {/* Full-width four-up grid on a phone so every option is a 44px-tall target; a compact pill
        group from sm up. */}
    <TabsList aria-label="Group by" className="grid w-full grid-cols-4 sm:inline-flex sm:w-fit h-auto">
      {GROUP_BY_OPTIONS.map((o) => (
        <TabsTrigger key={o.value} value={o.value} className="min-h-11 sm:min-h-8">
          {o.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
));
GroupByTabs.displayName = 'GroupByTabs';

export const GroupByControl = ({ groupBy, onGroupByChange, range, onRangeChange, hideRange = false }: GroupByControlProps) => {
  const { shown, handleChange } = useCompleteRangeOnly(range, onRangeChange);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />
      {!hideRange && <DateRangePicker value={shown} onChange={handleChange} placeholder="Custom range" className="w-full sm:w-64" />}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// The page's sticky time-window bar
// ---------------------------------------------------------------------------------------------

type PresetKey = 'week' | 'month' | 'last30' | 'quarter';

type PeriodTab = PresetKey | 'all' | 'custom';
const PERIOD_TABS: readonly PeriodTab[] = ['week', 'month', 'last30', 'quarter', 'all'];
const PERIOD_TAB_LABEL: Record<PeriodTab, string> = { week: 'This week', month: 'This month', last30: 'Last 30 days', quarter: 'This quarter', all: 'Longer view', custom: 'Custom' };

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'quarter', label: 'This quarter' },
];

/** A preset's window as local calendar days, always ending today. */
const presetRange = (key: PresetKey, now: Date = new Date()): { from: Date; to: Date } => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const to = new Date(y, m, d);
  if (key === 'week') return { from: new Date(y, m, d - ((now.getDay() + 6) % 7)), to };
  if (key === 'month') return { from: new Date(y, m, 1), to };
  if (key === 'quarter') return { from: new Date(y, Math.floor(m / 3) * 3, 1), to };
  return { from: new Date(y, m, d - 29), to };
};

const activePreset = (range: DateRangeValue): PresetKey | null => {
  if (!range.from || !range.to) return null;
  const from = toDateParam(range.from);
  const to = toDateParam(range.to);
  return PRESETS.find(({ key }) => {
    const p = presetRange(key);
    return toDateParam(p.from) === from && toDateParam(p.to) === to;
  })?.key ?? null;
};

interface AnalyticsControlBarProps extends Omit<GroupByControlProps, 'hideRange'> {
  /** Epoch ms of the newest report fetch, or null before the first one lands. */
  updatedAt: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Extra buttons beside Refresh (the page has no title bar of its own to hold them). */
  actions?: ReactNode;
}

const formatUpdated = (ms: number) => new Date(ms).toLocaleTimeString(ANALYTICS_LOCALE, { hour: 'numeric', minute: '2-digit' });

/**
 * One place that says which time window the page is showing and lets you change it: the grouping,
 * a preset or custom range, what that resolves to, and when the numbers were last fetched. Sticks
 * to the top of the page from lg up; below that it scrolls away so it never eats a phone or a
 * landscape screen.
 */
export const AnalyticsControlBar = ({ groupBy, onGroupByChange, range, onRangeChange, updatedAt, isRefreshing, onRefresh, actions }: AnalyticsControlBarProps) => {
  const { shown, handleChange } = useCompleteRangeOnly(range, onRangeChange);
  const preset = activePreset(range);
  const hasRange = Boolean(range.from && range.to);
  const isCustom = hasRange && preset === null;
  // One tab row for the period: the four presets and the long view (no range: the last 12 periods).
  const periodValue: PeriodTab = preset ?? (hasRange ? 'custom' : 'all');
  const choosePeriod = (key: PeriodTab) => {
    if (key === 'custom') return;
    onRangeChange(key === 'all' ? { from: null, to: null } : presetRange(key));
  };
  const rangeText = hasRange && range.from && range.to
    ? `${range.from.toLocaleDateString(ANALYTICS_LOCALE, { day: 'numeric', month: 'short' })} to ${range.to.toLocaleDateString(ANALYTICS_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : defaultWindowLabel(groupBy);

  return (
    <div className="lg:sticky lg:top-0 z-20 flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface/95 backdrop-blur p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="px-0.5 t-meta font-display font-semibold text-text-muted">Period</span>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodTabControl
              value={periodValue === 'custom' ? ('custom' as PeriodTab) : periodValue}
              options={PERIOD_TABS}
              labels={{ ...PERIOD_TAB_LABEL, all: defaultWindowLabel(groupBy) }}
              onChange={choosePeriod}
            />
            {/* Any other dates: the picker, dressed as one more option; lit when the range is custom. */}
            <DateRangePicker
              value={shown}
              onChange={handleChange}
              placeholder="Custom dates"
              placeholderIsValue
              className="w-auto shrink-0"
              triggerClassName={`h-11 sm:h-9 w-auto gap-1.5 pl-2.5 ${isCustom ? 'pr-10' : 'pr-3'} rounded-lg text-sm font-display [&>span:first-child]:size-4 [&>span:first-child]:bg-transparent [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-nowrap ${isCustom ? 'border-primary-500 bg-primary-600 text-white [&_*]:text-white' : 'text-text-secondary hover:border-border-hover'}`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="px-0.5 t-meta font-display font-semibold text-text-muted">Show by</span>
          <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-display font-semibold text-text">
          <CalendarDays className="size-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          <span className="truncate">{rangeText}</span>
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span aria-live="polite" className="hidden sm:inline t-meta text-text-muted tabular-nums">
            {isRefreshing ? 'Updating' : updatedAt ? `Updated ${formatUpdated(updatedAt)}` : ''}
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh numbers" className="pointer-coarse:min-h-11">
            <RefreshCw size={14} aria-hidden="true" className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : undefined} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {actions}
        </div>
      </div>
    </div>
  );
};
