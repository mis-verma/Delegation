import { memo, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, DateRangePicker, type DateRangeValue } from '../../../components';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useOrgToday } from '../../checklist/useOrgToday';
import { ANALYTICS_LOCALE, defaultWindowLabel, parseDateParam, toDateParam } from './analyticsDisplay';

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
// The page's time-window bar
// ---------------------------------------------------------------------------------------------

type PresetKey = 'week' | 'month' | 'lastMonth' | 'last30' | 'quarter' | 'year';

type PeriodTab = PresetKey | 'all' | 'custom';
const PERIOD_TABS: readonly PeriodTab[] = ['week', 'month', 'lastMonth', 'last30', 'quarter', 'year', 'all'];
const PERIOD_TAB_LABEL: Record<PeriodTab, string> = {
  week: 'This week', month: 'This month', lastMonth: 'Last month', last30: 'Last 30 days', quarter: 'This quarter', year: 'This year', all: 'Longer view', custom: 'Custom dates',
};

const PRESETS: PresetKey[] = ['week', 'month', 'lastMonth', 'last30', 'quarter', 'year'];

/** A preset's window as calendar days of the org's own today (never the device clock): ends today, except Last month. */
const presetRange = (key: PresetKey, now: Date): { from: Date; to: Date } => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const to = new Date(y, m, d);
  if (key === 'week') return { from: new Date(y, m, d - ((now.getDay() + 6) % 7)), to };
  if (key === 'month') return { from: new Date(y, m, 1), to };
  if (key === 'lastMonth') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
  if (key === 'quarter') return { from: new Date(y, Math.floor(m / 3) * 3, 1), to };
  if (key === 'year') return { from: new Date(y, 0, 1), to };
  return { from: new Date(y, m, d - 29), to };
};

const activePreset = (range: DateRangeValue, now: Date): PresetKey | null => {
  if (!range.from || !range.to) return null;
  const from = toDateParam(range.from);
  const to = toDateParam(range.to);
  return PRESETS.find((key) => {
    const p = presetRange(key, now);
    return toDateParam(p.from) === from && toDateParam(p.to) === to;
  }) ?? null;
};

interface AnalyticsControlBarProps extends Omit<GroupByControlProps, 'hideRange'> {
  /** Epoch ms of the newest report fetch, or null before the first one lands. */
  updatedAt: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Extra buttons beside Refresh (the page has no title bar of its own to hold them). */
  actions?: ReactNode;
  /** For a page with no grouping of its own (the Scorecard): only the period is offered. */
  hideGroupBy?: boolean;
}

const formatUpdated = (ms: number) => new Date(ms).toLocaleTimeString(ANALYTICS_LOCALE, { hour: 'numeric', minute: '2-digit' });

const SELECT_CLASS = 'min-h-11 w-full min-w-0 cursor-pointer rounded-lg border border-border bg-surface px-3 text-base font-display text-text outline-none transition-colors hover:border-border-hover focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30';

/**
 * One place that says which time window the page is showing and lets you change it: a preset or custom
 * range, the grouping, what that resolves to, and when the numbers were last fetched. Sticks to the top
 * of the page from lg up; below that it scrolls away so it never eats a phone or a landscape screen.
 * On a phone the period is ONE select (plus a compact Show by), so the headline numbers stay in view.
 */
export const AnalyticsControlBar = ({ groupBy, onGroupByChange, range, onRangeChange, updatedAt, isRefreshing, onRefresh, actions, hideGroupBy = false }: AnalyticsControlBarProps) => {
  const { shown, handleChange } = useCompleteRangeOnly(range, onRangeChange);
  // The org's calendar day, so a phone in another time zone names the same week and month as the server.
  const orgToday = useOrgToday();
  const now = useMemo(() => parseDateParam(orgToday) ?? new Date(), [orgToday]);
  const [pickingCustom, setPickingCustom] = useState(false);
  const preset = activePreset(range, now);
  const hasRange = Boolean(range.from && range.to);
  const isCustom = hasRange && preset === null;
  // One tab row for the period: the presets and the long view (no range: the last 12 periods).
  const periodValue: PeriodTab = preset ?? (hasRange ? 'custom' : 'all');
  const showCustomPicker = isCustom || pickingCustom;
  const choosePeriod = (key: PeriodTab) => {
    if (key === 'custom') {
      setPickingCustom(true);
      return;
    }
    setPickingCustom(false);
    onRangeChange(key === 'all' ? { from: null, to: null } : presetRange(key, now));
  };
  // Without a grouping of its own (the Scorecard) the long view is the last twelve weeks.
  const longLabel = hideGroupBy ? 'Last 12 weeks' : defaultWindowLabel(groupBy);
  const labels = { ...PERIOD_TAB_LABEL, all: longLabel };
  const rangeText = hasRange && range.from && range.to
    ? `${range.from.toLocaleDateString(ANALYTICS_LOCALE, { day: 'numeric', month: 'short' })} to ${range.to.toLocaleDateString(ANALYTICS_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : longLabel;
  // Year grouping with no dates picked: the charts reach back twelve years, but scores and rankings can
  // only cover one year, so say so once instead of letting two windows share one label.
  const yearNote = !hasRange && !hideGroupBy && groupBy === 'year'
    ? 'Charts cover the last 12 years. Scores, rankings and leaders cover the last 12 months.'
    : null;

  const customPicker = (className: string, triggerClassName?: string) => (
    <DateRangePicker value={shown} onChange={handleChange} placeholder="Custom dates" placeholderIsValue className={className} triggerClassName={triggerClassName} />
  );

  return (
    <div className="lg:sticky lg:top-0 z-20 flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-3 sm:p-4">
      {/* Phone: the period is one select, Show by a second one beside it. */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className={hideGroupBy ? undefined : 'grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-2'}>
          <select aria-label="Period" value={showCustomPicker ? 'custom' : periodValue} onChange={(e) => choosePeriod(e.target.value as PeriodTab)} className={SELECT_CLASS}>
            {[...PERIOD_TABS, 'custom' as const].map((key) => <option key={key} value={key}>{labels[key]}</option>)}
          </select>
          {!hideGroupBy && (
            <select aria-label="Show by" value={groupBy} onChange={(e) => onGroupByChange(e.target.value as GroupBy)} className={SELECT_CLASS}>
              {GROUP_BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>By {o.label.toLowerCase()}</option>)}
            </select>
          )}
        </div>
        {showCustomPicker && customPicker('w-full', 'min-h-11 w-full')}
      </div>

      <div className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="px-0.5 t-meta font-display font-semibold text-text-muted">Period</span>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodTabControl value={periodValue} options={PERIOD_TABS} labels={labels} onChange={choosePeriod} />
            {/* Any other dates: the picker, dressed as one more option; lit when the range is custom. */}
            {customPicker(
              'w-auto shrink-0',
              `h-11 sm:h-9 w-auto gap-1.5 pl-2.5 ${isCustom ? 'pr-10' : 'pr-3'} rounded-lg text-sm font-display [&>span:first-child]:size-4 [&>span:first-child]:bg-transparent [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-nowrap ${isCustom ? 'border-primary-500 bg-primary-600 text-white [&_*]:text-white' : 'text-text-secondary hover:border-border-hover'}`,
            )}
          </div>
        </div>

        {!hideGroupBy && (
          <div className="flex flex-col gap-1.5">
            <span className="px-0.5 t-meta font-display font-semibold text-text-muted">Show by</span>
            <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-display font-semibold text-text">
          <CalendarDays className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="line-clamp-2">{rangeText}</span>
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
      {yearNote && <p className="t-meta text-text-muted">{yearNote}</p>}
    </div>
  );
};
