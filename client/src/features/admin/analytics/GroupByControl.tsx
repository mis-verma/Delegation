import { memo, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, DateRangePicker, PANEL_CLASS, type DateRangeValue } from '../../../components';
import { cn } from '@/lib/utils';
import { SelectDropdown } from '../../../components/dropdown';
import { CARD_PAD, FIELD_LABEL_CLASS } from '../../scores/controlStyles';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useOrgToday } from '../../checklist/useOrgToday';
import { ANALYTICS_LOCALE, defaultWindow, defaultWindowLabel, parseDateParam, toDateParam } from './analyticsDisplay';

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
  hideRange?: boolean;
}

const useCompleteRangeOnly = (range: DateRangeValue, onRangeChange: (range: DateRangeValue) => void) => {
  const [draft, setDraft] = useState<{ base: DateRangeValue; value: DateRangeValue } | null>(null);
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
    <TabsList aria-label="Group by" className="grid w-full grid-cols-4 sm:inline-flex sm:flex-nowrap sm:w-fit h-auto">
      {GROUP_BY_OPTIONS.map((o) => (
        <TabsTrigger key={o.value} value={o.value} className="min-h-11 sm:min-h-9">
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />
      {!hideRange && <DateRangePicker value={shown} onChange={handleChange} placeholder="Custom range" className="w-full sm:w-64" />}
    </div>
  );
};

type PresetKey = 'week' | 'month' | 'lastMonth' | 'last30' | 'quarter' | 'year';

type PeriodTab = PresetKey | 'all' | 'custom';
const PERIOD_TABS: readonly PeriodTab[] = ['week', 'month', 'lastMonth', 'last30', 'quarter', 'year', 'all'];
const PERIOD_TAB_LABEL: Record<PeriodTab, string> = {
  week: 'This week', month: 'This month', lastMonth: 'Last month', last30: 'Last 30 days', quarter: 'This quarter', year: 'This year', all: 'Longer view', custom: 'Custom dates',
};

const PRESETS: PresetKey[] = ['week', 'month', 'lastMonth', 'last30', 'quarter', 'year'];

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
  updatedAt: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  actions?: ReactNode;
  hideGroupBy?: boolean;
  hideLongView?: boolean;
  sticky?: boolean;
}

const formatUpdated = (ms: number) => new Date(ms).toLocaleTimeString(ANALYTICS_LOCALE, { hour: 'numeric', minute: '2-digit' });

const CUSTOM_TRIGGER = 'h-11 sm:h-11.5 w-auto gap-1.5 pl-2.5 rounded-lg text-sm font-display [&>span:first-child]:size-4 [&>span:first-child]:bg-transparent [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-nowrap';

export const AnalyticsControlBar = ({ groupBy, onGroupByChange, range, onRangeChange, updatedAt, isRefreshing, onRefresh, actions, hideGroupBy = false, hideLongView = false, sticky = true }: AnalyticsControlBarProps) => {
  const { shown, handleChange } = useCompleteRangeOnly(range, onRangeChange);
  const orgToday = useOrgToday();
  const now = useMemo(() => parseDateParam(orgToday) ?? new Date(), [orgToday]);
  const [pickingCustom, setPickingCustom] = useState(false);
  const preset = activePreset(range, now);
  const hasRange = Boolean(range.from && range.to);
  const isCustom = hasRange && preset === null;
  const showCustomPicker = isCustom || pickingCustom;

  const longLabel = hideGroupBy ? 'Last 12 weeks' : defaultWindowLabel(groupBy);
  const longViewRepeatsPreset = longLabel === PERIOD_TAB_LABEL.last30;
  const tabs = hideLongView || longViewRepeatsPreset ? PERIOD_TABS.filter((key) => key !== 'all') : PERIOD_TABS;
  const periodValue: PeriodTab = preset ?? (hasRange ? 'custom' : longViewRepeatsPreset && !hideLongView ? 'last30' : 'all');
  const labels = { ...PERIOD_TAB_LABEL, all: longLabel };

  const choosePeriod = (key: PeriodTab) => {
    if (key === 'custom') {
      setPickingCustom(true);
      return;
    }
    setPickingCustom(false);
    onRangeChange(key === 'all' ? { from: null, to: null } : presetRange(key, now));
  };

  const shownWindow = useMemo(() => {
    if (range.from && range.to) return { from: range.from, to: range.to };
    const fallback = defaultWindow(hideGroupBy ? 'week' : groupBy, now);
    return { from: new Date(fallback.from), to: new Date(fallback.to) };
  }, [range.from, range.to, hideGroupBy, groupBy, now]);
  const rangeText = `${shownWindow.from.toLocaleDateString(ANALYTICS_LOCALE, { day: 'numeric', month: 'short' })} to ${shownWindow.to.toLocaleDateString(ANALYTICS_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const yearNote = !hasRange && !hideGroupBy && groupBy === 'year'
    ? 'Charts cover the last 12 years. Scores, rankings and leaders cover the last 12 months.'
    : null;

  const customPicker = (className: string, triggerClassName?: string) => (
    <DateRangePicker value={shown} onChange={handleChange} placeholder="Custom dates" placeholderIsValue className={className} triggerClassName={triggerClassName} />
  );

  return (
    <div className={cn(PANEL_CLASS, 'z-20 flex flex-col gap-3', sticky && 'lg:sticky lg:top-0', CARD_PAD)}>
      <div className="flex flex-col gap-3 sm:hidden">
        <div className={hideGroupBy ? undefined : 'grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-3'}>
          <SelectDropdown label="Period" aria-label="Period" triggerClassName="rounded-lg font-display" value={showCustomPicker ? 'custom' : periodValue} onChange={choosePeriod} options={[...tabs, 'custom' as const].map((key) => ({ value: key, label: labels[key] }))} />
          {!hideGroupBy && (
            <SelectDropdown label="Show by" aria-label="Show by" triggerClassName="rounded-lg font-display" value={groupBy} onChange={onGroupByChange} options={GROUP_BY_OPTIONS.map((o) => ({ value: o.value, label: `By ${o.label.toLowerCase()}` }))} />
          )}
        </div>
        {showCustomPicker && customPicker('w-full', 'min-h-11 w-full')}
      </div>

      <div className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:flex">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>Period</span>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodTabControl value={periodValue} options={tabs} labels={labels} onChange={choosePeriod} />
            {customPicker(
              'w-auto shrink-0',
              cn(CUSTOM_TRIGGER, hasRange ? 'pr-10' : 'pr-3', isCustom ? 'border-primary-500 bg-primary-600 text-white [&_*]:text-white' : 'text-text-secondary hover:border-border-hover'),
            )}
          </div>
        </div>
        {!hideGroupBy && (
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>Show by</span>
            <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
        <span className="inline-flex min-w-0 items-center gap-2 t-card font-display font-semibold text-text">
          <CalendarDays className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="line-clamp-2">{rangeText}</span>
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span aria-live="polite" className="hidden min-w-24 text-right sm:inline t-meta text-text-muted tabular-nums">
            {isRefreshing ? 'Updating' : updatedAt ? `Updated ${formatUpdated(updatedAt)}` : ''}
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh numbers">
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
