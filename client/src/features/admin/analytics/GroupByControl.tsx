import { memo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActiveRangeBadge, Button, DateRangePicker, ToggleChip, type DateRangeValue } from '../../../components';
import { endOfDay } from '../../../lib/dateRange';
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
}

const formatUpdated = (ms: number) => new Date(ms).toLocaleTimeString(ANALYTICS_LOCALE, { hour: 'numeric', minute: '2-digit' });

/**
 * One place that says which time window the page is showing and lets you change it: the grouping,
 * a preset or custom range, what that resolves to, and when the numbers were last fetched. Sticks
 * to the top of the page from lg up; below that it scrolls away so it never eats a phone or a
 * landscape screen.
 */
export const AnalyticsControlBar = ({ groupBy, onGroupByChange, range, onRangeChange, updatedAt, isRefreshing, onRefresh }: AnalyticsControlBarProps) => {
  const { shown, handleChange } = useCompleteRangeOnly(range, onRangeChange);
  const preset = activePreset(range);
  const hasRange = Boolean(range.from && range.to);
  const isCustom = hasRange && preset === null;

  const applyPreset = (key: PresetKey) => {
    if (preset === key) {
      onRangeChange({ from: null, to: null });
      return;
    }
    onRangeChange(presetRange(key));
  };

  const groupLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label.toLowerCase() ?? groupBy;

  return (
    <div className="lg:sticky lg:top-0 z-20 flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/95 backdrop-blur p-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />

        <div role="group" aria-label="Time period" className="flex flex-wrap items-center gap-2">
          {PRESETS.map(({ key, label }) => (
            <ToggleChip key={key} on={preset === key} onClick={() => applyPreset(key)}>
              {label}
            </ToggleChip>
          ))}
          {/* The Custom chip is the range picker itself, dressed as a chip; it lights up when the
              range matches none of the presets. */}
          <DateRangePicker
            value={shown}
            onChange={handleChange}
            placeholder="Custom"
            placeholderIsValue
            className="w-auto"
            triggerClassName={`h-11 sm:h-8 w-auto gap-1.5 px-3 rounded-full text-xs font-display ${isCustom ? 'border-primary-500/50 bg-primary-500/10' : ''}`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ActiveRangeBadge
            from={range.from && range.to ? range.from.toISOString() : undefined}
            to={range.from && range.to ? endOfDay(range.to).toISOString() : undefined}
            emptyLabel={defaultWindowLabel(groupBy)}
          />
          <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-border bg-surface-hover/60 text-xs font-display font-medium text-text-muted">
            By {groupLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-xs font-display text-text-muted tabular-nums">
            {isRefreshing ? 'Updating' : updatedAt ? `Updated ${formatUpdated(updatedAt)}` : ''}
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh numbers">
            <RefreshCw size={14} aria-hidden="true" className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : undefined} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
};
