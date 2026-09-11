import { useMemo, useState } from 'react';
import { ClipboardCheck, ShieldCheck, Sparkles, TrendingUp, TrendingDown, Minus, Download, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RadialGauge } from '../../components';
import { Modal } from '../../components/modal';
import { useIsMobile } from '../../lib/useMediaQuery';
import { BreakdownRatioRows } from './PinnedBreakdown';
import { DrilldownModal } from './DrilldownModal';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu';
import { csvBlob, xlsxBlob, downloadBlob, stampedFilename, type TableRows } from '../../lib/exportTable';
import { useDepartmentsQuery, useStoresQuery, useAssignableUsersQuery } from '../tickets/hook';
import {
  lastActivityBuckets,
  rateTone,
  pointDelta,
  ACTIVITY_BUCKET_COUNT,
  ACTIVITY_GROUP_RANGE_LABEL,
  ACTIVITY_CATEGORY_ORDER,
  ACTIVITY_CATEGORY_LABEL,
  type ActivityGroupBy,
  type ActivityCategory,
  type ActivityWorkItem,
  type RateTone,
  type Trend,
} from './dashboardDisplay';

// Sentinel for "no scope picked" — Radix Select's Item can't take an empty-string value, and
// `null`/`undefined` isn't a valid controlled value either, so every filter uses this string and
// gets translated back to `null` at the point it's read.
const ALL = 'all';

// The breakdown rows only carry a display label ("Ticket"), not the category key that produced
// it — this reverses ACTIVITY_CATEGORY_LABEL once so a clicked row's label can look its category
// back up for drill-down filtering.
const LABEL_TO_CATEGORY = Object.fromEntries(
  ACTIVITY_CATEGORY_ORDER.map((c) => [ACTIVITY_CATEGORY_LABEL[c], c]),
) as Record<string, ActivityCategory>;

const CATEGORY_VIEW_ALL_HREF: Record<ActivityCategory, string> = {
  delegation: '/tasks',
  ticket: '/tickets',
  checklist: '/checklists',
  todo: '/todo',
};

interface ActivityComplianceGaugesProps {
  items: ActivityWorkItem[];
  activeCategories: ReadonlySet<ActivityCategory>;
  groupBy: ActivityGroupBy;
}

type GaugeKey = 'completion' | 'onTime';

interface CategoryBreakdownRow {
  label: string;
  count: number;
  total: number;
}

interface GaugeProps {
  icon: LucideIcon;
  label: string;
  percent: number | null;
  count: number;
  total: number;
  trend: Trend | null;
  isSelected: boolean;
  onToggle: () => void;
}

// Only the icon and trend badge carry tone color now — the card itself stays one neutral surface
// regardless of performance, so the two gauges don't turn the card into a traffic-light panel.
const TONE_ACCENT: Record<RateTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text-muted',
};

const Gauge = ({ icon: Icon, label, percent, count, total, trend, isSelected, onToggle }: GaugeProps) => {
  const isNull = percent == null;
  const accentColor = isNull ? 'text-text-muted' : TONE_ACCENT[rateTone(percent, total)];
  // pointDelta() always signs its label ("+0.0%", never a bare "0%"), so a genuinely flat trend
  // has to be detected by parsing the number back out rather than string-matching the label.
  const isFlatTrend = trend != null && Number.parseFloat(trend.label) === 0;
  const TrendIcon = trend == null ? null : isFlatTrend ? Minus : trend.direction === 'up' ? TrendingUp : TrendingDown;
  const isMobile = useIsMobile();
  // Bigger than the old 108 — two full circles side by side, each taking half the card's width,
  // have the room to read as genuinely large charts instead of the compact gauges these replaced.
  const gaugeSize = isMobile ? 132 : 176;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      aria-pressed={isSelected}
      aria-label={`${label}, ${isNull ? 'no data' : `${percent}%`}. Tap for the per-category breakdown.`}
      className={`group relative flex flex-col items-center justify-center gap-3 sm:gap-4 w-full p-3 sm:p-6 rounded-3xl border-2 bg-surface-hover/30 transition-all duration-300 overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
        isSelected ? 'border-primary-500' : 'border-transparent hover:border-border/60'
      }`}
    >
      {/* Trend badge — how this rate moved against the equivalent prior window, so the number
          reads as "getting better/worse" at a glance instead of a static snapshot. */}
      {TrendIcon && trend && (
        <div
          className={`absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-display font-bold tabular-nums ${
            isFlatTrend
              ? 'bg-surface text-text-muted border border-border/50'
              : trend.direction === 'up'
                ? 'bg-success/10 text-success'
                : 'bg-danger/10 text-danger'
          }`}
        >
          <TrendIcon size={12} strokeWidth={2.75} />
          {trend.label}
        </div>
      )}

      {/* Gauge Container with subtle hover lift */}
      <div className="relative z-10 transform transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105">
        {/* Fill is always the brand navy, not the tone color — the tone (success/warning/danger)
            still drives the card's tint and the trend badge, but the chart itself stays on the
            same navy palette the rest of the dashboard (bar chart, sidebar) uses. */}
        <RadialGauge percent={percent ?? 0} size={gaugeSize} variant="circle" gradientFrom="var(--color-primary-700, #213e6a)" gradientTo="var(--color-primary-700, #213e6a)">
          <div className="flex flex-col items-center justify-center animate-in zoom-in duration-500">
            <span className={`text-2xl font-display font-black tracking-tighter ${isNull ? 'text-text-muted/50' : 'text-text'}`}>
              {isNull ? '—' : `${percent}%`}
            </span>
          </div>
        </RadialGauge>
      </div>

      {/* Label, Icon & raw count — the count is what makes the percentage trustworthy at a
          glance ("3 of 4" reads very differently from "300 of 400" even at the same 75%). */}
      <div className="relative z-10 flex flex-col items-center gap-1 mt-1">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center size-7 rounded-lg bg-surface shadow-sm border border-border/50 transition-colors ${accentColor} group-hover:border-current/30`}>
            <Icon size={14} strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-display font-bold text-text-secondary group-hover:text-text transition-colors">
            {label}
          </span>
        </div>
        {!isNull && (
          <span className="text-[11px] font-display font-medium text-text-light tabular-nums">
            {count} of {total}
          </span>
        )}
      </div>
    </div>
  );
};

export const ActivityComplianceGauges = ({ items, activeCategories, groupBy }: ActivityComplianceGaugesProps) => {
  const [selected, setSelected] = useState<GaugeKey | null>(null);
  const [drilldownCategory, setDrilldownCategory] = useState<ActivityCategory | null>(null);

  // "All" until an admin narrows it — Department, Store and Person are independent, combinable
  // scopes (e.g. one department at one store), not tabs. A Department filter is also the
  // practical stand-in for "HOD-wise": an HOD is just a MANAGER who heads a single department
  // (there's no separate HOD field anywhere in the data model), so scoping to their department
  // already shows their compliance.
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const { data: departmentsData = [] } = useDepartmentsQuery();
  const { data: storesData = [] } = useStoresQuery();
  const { data: peopleData = [] } = useAssignableUsersQuery();
  // The API doesn't guarantee alphabetical order (and doesn't need to — every other consumer of
  // these hooks renders its own checkbox list or table, not a scannable dropdown) — sorted here,
  // once, rather than making an admin hunt through an arbitrarily-ordered list of every department/
  // store/person in the org to find the one they want.
  const departments = useMemo(() => [...departmentsData].sort((a, b) => a.name.localeCompare(b.name)), [departmentsData]);
  const stores = useMemo(() => [...storesData].sort((a, b) => a.name.localeCompare(b.name)), [storesData]);
  const people = useMemo(
    () => [...peopleData].sort((a, b) => `${a.firstName} ${a.lastName ?? ''}`.localeCompare(`${b.firstName} ${b.lastName ?? ''}`)),
    [peopleData],
  );

  const scopedItems = useMemo(
    () =>
      items.filter(
        (i) =>
          (!departmentId || i.departmentId === departmentId) &&
          (!storeId || i.storeId === storeId) &&
          (!personId || i.userIds.includes(personId)),
      ),
    [items, departmentId, storeId, personId],
  );

  // Bucket indices don't carry over between granularities, but a gauge selection has no index to
  // begin with — still reset on groupBy change so a pinned breakdown doesn't linger scoped to the
  // period the user just switched away from.
  const [prevGroupBy, setPrevGroupBy] = useState(groupBy);
  if (groupBy !== prevGroupBy) {
    setPrevGroupBy(groupBy);
    setSelected(null);
    setDrilldownCategory(null);
  }

  const { completionRate, onTimeRate, completed, onTime, total, completionBreakdown, onTimeBreakdown, completionTrend, onTimeTrend, scoped } = useMemo(() => {
    const buckets = lastActivityBuckets(groupBy, ACTIVITY_BUCKET_COUNT[groupBy]);
    const start = buckets[0].start;
    const end = buckets[buckets.length - 1].end;
    // The equivalent window immediately before the one shown — same duration, shifted back — so
    // the trend badge compares "this last 7 days" against "the 7 days before that", not an
    // arbitrary lookback.
    const windowMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - windowMs);
    const prevEnd = start;

    const activeOrder = ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c));
    const inRange = (createdAt: string, rangeStart: Date, rangeEnd: Date) => {
      const t = new Date(createdAt).getTime();
      return t >= rangeStart.getTime() && t < rangeEnd.getTime();
    };
    const scoped = scopedItems.filter((i) => activeCategories.has(i.category) && inRange(i.createdAt, start, end));
    const prevScoped = scopedItems.filter((i) => activeCategories.has(i.category) && inRange(i.createdAt, prevStart, prevEnd));

    const rateOf = (list: typeof items, pick: (i: ActivityWorkItem) => boolean) =>
      list.length > 0 ? Math.round((list.filter(pick).length / list.length) * 100) : null;

    const completed = scoped.filter((i) => i.completed).length;
    const overdue = scoped.filter((i) => i.overdue).length;
    const total = scoped.length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;
    const onTimeRate = total > 0 ? Math.round(((total - overdue) / total) * 100) : null;
    const prevCompletionRate = rateOf(prevScoped, (i) => i.completed);
    const prevOnTimeRate = rateOf(prevScoped, (i) => !i.overdue);

    const completionBreakdown: CategoryBreakdownRow[] = activeOrder.map((category) => {
      const categoryItems = scoped.filter((i) => i.category === category);
      return { label: ACTIVITY_CATEGORY_LABEL[category], count: categoryItems.filter((i) => i.completed).length, total: categoryItems.length };
    });
    const onTimeBreakdown: CategoryBreakdownRow[] = activeOrder.map((category) => {
      const categoryItems = scoped.filter((i) => i.category === category);
      return { label: ACTIVITY_CATEGORY_LABEL[category], count: categoryItems.length - categoryItems.filter((i) => i.overdue).length, total: categoryItems.length };
    });

    return {
      completed,
      total,
      onTime: total - overdue,
      completionRate,
      onTimeRate,
      completionBreakdown,
      onTimeBreakdown,
      completionTrend: completionRate != null && prevCompletionRate != null ? pointDelta(completionRate, prevCompletionRate) : null,
      onTimeTrend: onTimeRate != null && prevOnTimeRate != null ? pointDelta(onTimeRate, prevOnTimeRate) : null,
      // Kept for drill-down — the exact same time+scope-filtered set the rates above were computed
      // from, so a clicked breakdown row lists precisely the records behind its number.
      scoped,
    };
  }, [scopedItems, activeCategories, groupBy]);

  const activeBreakdown = selected === 'completion' ? completionBreakdown : selected === 'onTime' ? onTimeBreakdown : null;
  const activeLabel = selected === 'completion' ? 'Completion' : selected === 'onTime' ? 'On-time Compliance' : null;

  const departmentName = departments.find((d) => d.id === departmentId)?.name ?? 'All departments';
  const storeName = stores.find((s) => s.id === storeId)?.name ?? 'All stores';
  const personName = (() => {
    const person = people.find((p) => p.id === personId);
    return person ? `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}` : 'All people';
  })();

  // Built from the same numbers the gauges are rendering, not a re-query — an export that
  // disagrees with the card the user is looking at is worse than no export. Percentages go out as
  // numbers so they stay sortable/averageable in a spreadsheet, and a category with nothing in it
  // exports a blank rather than a misleading 0% (the card shows "No data" for the same case).
  const buildExportRows = (): TableRows => {
    const pct = (count: number, of: number) => (of > 0 ? Math.round((count / of) * 100) : null);
    const activeLabels = ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c)).map((c) => ACTIVITY_CATEGORY_LABEL[c]);

    return [
      ['Compliance export'],
      ['Generated', new Date().toLocaleString()],
      ['Window', `Trailing ${ACTIVITY_GROUP_RANGE_LABEL[groupBy]}`],
      ['Department', departmentName],
      ['Store', storeName],
      ['Person', personName],
      ['Categories included', activeLabels.join(', ')],
      // Only Ticket carries all three scope dimensions, so a scoped export drops whatever lacks
      // the dimension — the same caveat the card shows on screen travels with the file.
      ...(departmentId || storeId || personId
        ? [['Note', 'Scoped view — items without the filtered dimension (e.g. Todos) are excluded from these totals.']]
        : []),
      [],
      ['Category', 'Total', 'Completed', 'Completion %', 'On time', 'On-time %'],
      ...completionBreakdown.map((row, i) => {
        const onTimeCount = onTimeBreakdown[i]?.count ?? 0;
        return [row.label, row.total, row.count, pct(row.count, row.total), onTimeCount, pct(onTimeCount, row.total)];
      }),
      ['All categories', total, completed, completionRate, onTime, onTimeRate],
    ];
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    const rows = buildExportRows();
    const blob = format === 'csv' ? csvBlob(rows) : xlsxBlob(rows, 'Compliance');
    downloadBlob(blob, stampedFilename('compliance', format));
    toast.success(`Compliance exported as ${format.toUpperCase()}`);
  };

  return (
    // `@container` drives the wide-width split below off this card's own measured width rather
    // than the viewport, so it behaves correctly regardless of the sidebar's state.
    <section aria-labelledby="compliance-heading" className="@container rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-4 sm:p-6 lg:p-7 flex flex-col gap-5">
      {/* Same icon-tile + title + subtitle header every other Dashboard card (Activity Overview,
          Compare Dashboard, Delegation Score) uses — this used to be a small badge meant to read
          as a side-panel of the bar chart's own card; now that it's a standalone card in its own
          right, it gets the same header weight as its siblings instead of looking like a lesser
          fragment. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-800/50 text-primary-600 dark:text-primary-400 shadow-sm">
            <Sparkles size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h2 id="compliance-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Compliance</h2>
            <p className="text-xs font-medium text-text-muted mt-0.5 capitalize">
              Completion and on-time compliance rate, trailing {ACTIVITY_GROUP_RANGE_LABEL[groupBy]}
            </p>
          </div>
        </div>

        {/* Downloads exactly what's on screen — current scope filters, current category filters,
            current window. Generated in the browser (see lib/exportTable) rather than through the
            server's /reports export, because these figures are computed here and a server-side
            recomputation could hand back numbers that don't match the gauges. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Export compliance data"
              className="inline-flex items-center justify-center gap-1.5 shrink-0 self-start sm:self-auto h-9 px-3 rounded-xl border border-border/60 bg-surface-hover/50 text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out cursor-pointer"
            >
              <Download size={14} strokeWidth={2.5} />
              Export
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2">
              <FileText size={14} />
              CSV (.csv)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('xlsx')} className="gap-2">
              <FileSpreadsheet size={14} />
              Excel (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* One compact row, not a two-column layout with its own rail — the previous 17rem sidebar
          of three selects next to a taller gauges+breakdown column left a block of dead space under
          the selects on every screen wide enough to split them apart. Wrapping in a single row
          scales with however many filters are active instead of reserving a fixed-width column
          for them. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={departmentId ?? ALL} onValueChange={(v) => setDepartmentId(v === ALL ? null : v)}>
          {/* aria-label, not just the placeholder — once a department is picked, SelectValue shows
              its name ("Engineering"), which on its own gives a screen reader no indication this
              trigger is the *department* filter rather than the store or person one. */}
          <SelectTrigger size="sm" className="w-auto min-w-[8.5rem]" aria-label="Filter by department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={storeId ?? ALL} onValueChange={(v) => setStoreId(v === ALL ? null : v)}>
          <SelectTrigger size="sm" className="w-auto min-w-[8.5rem]" aria-label="Filter by store">
            <SelectValue placeholder="All stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stores</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={personId ?? ALL} onValueChange={(v) => setPersonId(v === ALL ? null : v)}>
          <SelectTrigger size="sm" className="w-auto min-w-[8.5rem]" aria-label="Filter by person">
            <SelectValue placeholder="All people" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All people</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.firstName}{p.lastName ? ` ${p.lastName}` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Only Ticket carries all three scope dimensions — narrowing by any of them silently drops
            categories that don't have it (Task has no store, Todo/checklist have no department,
            Todo has no owner at all) rather than matching them against the wrong thing. Surfaced
            here so a shrunk total reads as "expected" rather than "is this broken". Inline now
            instead of its own paragraph below the selects — one more thing the concise row folds
            in rather than stacking. */}
        {(departmentId || storeId || personId) && (
          <p className="text-[11px] font-medium text-text-light basis-full sm:basis-auto">
            Scoped — excludes items with no matching {[departmentId && 'department', storeId && 'store', personId && 'assignee'].filter(Boolean).join('/')}.
          </p>
        )}
      </div>

      {/* Gauges — a centered pair, capped so they read as a cluster of circles rather than
          drifting apart on a wide monitor. Tapping one now opens the breakdown straight in a modal
          (see below) instead of an always-reserved panel under the gauges, which is what let this
          whole card shrink down to just its header + filter row + rings when nothing is selected. */}
      <div className="flex justify-center">
        <div className="grid grid-cols-2 gap-3 sm:gap-6 w-full max-w-xl">
          <Gauge
            icon={ClipboardCheck}
            label="Completion"
            percent={completionRate}
            count={completed}
            total={total}
            trend={completionTrend}
            isSelected={selected === 'completion'}
            onToggle={() => setSelected((prev) => (prev === 'completion' ? null : 'completion'))}
          />
          <Gauge
            icon={ShieldCheck}
            label="On-time Compliance"
            percent={onTimeRate}
            count={onTime}
            total={total}
            trend={onTimeTrend}
            isSelected={selected === 'onTime'}
            onToggle={() => setSelected((prev) => (prev === 'onTime' ? null : 'onTime'))}
          />
        </div>
      </div>

      {/* Tapping a ring opens its full breakdown here — a real modal, not an inline panel — so it
          reads as "this expands to show everything" rather than a small addendum tucked under the
          card. Picking a category inside hands off to the item-level DrilldownModal below. */}
      {activeBreakdown && activeLabel && (
        <Modal
          open={selected !== null}
          onClose={() => setSelected(null)}
          title={`${activeLabel} breakdown`}
          description={`Trailing ${ACTIVITY_GROUP_RANGE_LABEL[groupBy]}`}
          size="sm"
        >
          <div className="flex items-center gap-4 pb-1">
            <div className="flex items-center justify-center size-16 rounded-full border-4 border-primary-700/90 shrink-0">
              <span className="text-lg font-display font-black text-text tabular-nums">
                {selected === 'completion' ? completionRate : onTimeRate}%
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-display font-bold text-text">
                {selected === 'completion' ? completed : onTime} of {total}
              </p>
              <p className="text-[11px] font-medium text-text-light">Across every active category below</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
            <BreakdownRatioRows rows={activeBreakdown} onRowClick={(label) => { setSelected(null); setDrilldownCategory(LABEL_TO_CATEGORY[label]); }} />
          </div>
        </Modal>
      )}

      {drilldownCategory && activeLabel && (
        <DrilldownModal
          open
          onClose={() => setDrilldownCategory(null)}
          title={`${ACTIVITY_CATEGORY_LABEL[drilldownCategory]} — ${activeLabel}`}
          description={`Trailing ${ACTIVITY_GROUP_RANGE_LABEL[groupBy]}`}
          rows={scoped.filter((i) => i.category === drilldownCategory)}
          viewAllHref={CATEGORY_VIEW_ALL_HREF[drilldownCategory]}
          viewAllLabel={`View all ${ACTIVITY_CATEGORY_LABEL[drilldownCategory].toLowerCase()}s`}
        />
      )}
    </section>
  );
};
