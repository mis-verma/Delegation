import { memo, useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, ChevronRight, ClipboardCheck, Timer, Store, User, X, ShieldCheck, Sparkles, Download, FileSpreadsheet, FileText, Info, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RadialGauge, EntityIconTile, Button, Combobox } from '../../components';
import { OptionsSheet, OptionSection, ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear } from '../../components/optionsSheet';
import { Modal } from '../../components/modal';
import { useIsMobile, useMediaQuery } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { BreakdownRatioRows } from './PinnedBreakdown';
import { DrilldownList, DrilldownViewAllButton } from './DrilldownModal';
import { DeltaBadge } from './RateDelta';
import { useApprovalTatQuery } from './useApprovalTat';
import { isTrendReady } from './trendGate';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
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
  DASHBOARD_CARD_CLASS,
  type ActivityGroupBy,
  type ActivityCategory,
  type ActivityWorkItem,
  type RateTone,
} from './dashboardDisplay';

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

export type CategoryScope = 'org' | 'mine';

// Delegations and tickets reach this card org-wide; checklist runs and todos are only ever loaded
// for the signed-in user. Saying so per category stops a blended number reading as an org figure.
const DEFAULT_CATEGORY_SCOPE: Record<ActivityCategory, CategoryScope> = {
  delegation: 'org',
  ticket: 'org',
  checklist: 'mine',
  todo: 'mine',
};

const SCOPE_LABEL: Record<CategoryScope, string> = { org: 'Org', mine: 'Mine' };

interface ActivityComplianceGaugesProps {
  items: ActivityWorkItem[];
  activeCategories: ReadonlySet<ActivityCategory>;
  groupBy: ActivityGroupBy;
  /** Org-wide checklist item figure (items done of items in total). When given it replaces the
   *  signed-in user's own checklist runs in the Done rate; when absent the card uses `items`. */
  orgChecklistRate?: { done: number; total: number } | null;
  /** Per-category "Org" or "Mine" tag. Anything not listed keeps the default for that category. */
  categoryScope?: Partial<Record<ActivityCategory, CategoryScope>>;
}

type GaugeKey = 'completion' | 'onTime' | 'approval';

interface CategoryBreakdownRow {
  label: string;
  count: number;
  total: number;
}

interface GaugeProps {
  gaugeKey: GaugeKey;
  icon: LucideIcon;
  label: string;
  /** One-line plain definition shown in the info popover. */
  definition: string;
  percent: number | null;
  /** "41 of 50 created" style caption under the label. */
  caption: string;
  /** Denominator behind the percent; tiny volumes keep a neutral tone. */
  volume: number;
  delta: number | null;
  deltaTitle: string;
  isSelected: boolean;
  size: number;
  onToggle: (key: GaugeKey) => void;
}

// Only the icon carries tone color now — the card itself stays one neutral surface regardless of
// performance, so the two gauges don't turn the card into a traffic-light panel.
// The ring itself is coloured by how the score reads (green good, amber middle, red low), so 20% and
// 95% no longer look the same. A tiny volume or no data keeps the brand blue.
const TONE_FILL: Record<RateTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-primary-700)',
};

const TONE_ACCENT: Record<RateTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text-muted',
};

// Late = open past its deadline or finished after it. Items without a `late` flag fall back to the
// plain overdue flag. An item that is neither done nor late is simply not due yet.
const isLate = (i: ActivityWorkItem) => i.late ?? i.overdue;
const isDue = (i: ActivityWorkItem) => i.completed || isLate(i);

const percentOf = (count: number, of: number) => (of > 0 ? Math.round((count / of) * 100) : null);

const Gauge = memo(({ gaugeKey, icon: Icon, label, definition, percent, caption, volume, delta, deltaTitle, isSelected, size, onToggle }: GaugeProps) => {
  const isNull = percent == null;
  const hasCaption = !isNull && caption !== '';
  const accentColor = isNull ? 'text-text-muted' : TONE_ACCENT[rateTone(percent, volume)];

  return (
    <div
      className={`relative flex flex-col items-center gap-2 w-full p-3 sm:p-6 rounded-2xl border-2 bg-surface-hover/30 transition-colors duration-200 motion-reduce:transition-none ${
        isSelected ? 'border-primary-500' : 'border-transparent hover:border-border'
      }`}
    >
      {/* A real button with the whole reading in its label — the ring is a picture of it. The
          info button below is a sibling, not a child, so no button is nested inside another. */}
      <button
        type="button"
        onClick={() => onToggle(gaugeKey)}
        aria-haspopup="dialog"
        aria-label={`${label}: ${isNull ? 'No data' : `${percent}%`}${hasCaption ? `, ${caption}` : ''}. Open the breakdown by category.`}
        className="flex flex-col items-center gap-3 sm:gap-4 w-full min-h-11 rounded-xl outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <RadialGauge percent={percent ?? 0} size={size} variant="circle" gradientFrom={isNull ? TONE_FILL.neutral : TONE_FILL[rateTone(percent, volume)]} gradientTo={isNull ? TONE_FILL.neutral : TONE_FILL[rateTone(percent, volume)]}>
          <span className={`font-display font-black tracking-tight ${isNull ? 'text-xs sm:text-sm text-text-muted' : 'text-lg sm:text-2xl text-text'}`}>
            {isNull ? 'No data' : `${percent}%`}
          </span>
        </RadialGauge>

        <span className="flex flex-col items-center gap-1 text-center">
          <span className="flex items-center gap-2">
            <span className={`hidden sm:flex items-center justify-center size-7 rounded-lg bg-surface border border-border/50 ${accentColor}`}>
              <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="text-xs sm:text-sm font-display font-bold text-text-secondary leading-tight">{label}</span>
          </span>
          {/* The raw count is what makes the percentage trustworthy: "3 of 4" reads very
              differently from "300 of 400" at the same 75%. */}
          {hasCaption && <span className="text-xs font-display font-medium text-text-muted tabular-nums">{caption}</span>}
          <span className="inline-flex items-center gap-0.5 text-xs font-display font-semibold text-primary-700 dark:text-primary-300">
            See breakdown
            <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" />
          </span>
        </span>
      </button>

      <DeltaBadge delta={isNull ? null : delta} title={deltaTitle} />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`What ${label} means`}
            className="absolute top-1 right-1 flex items-center justify-center size-8 pointer-coarse:size-11 rounded-full text-text-muted hover:text-text hover:bg-surface-hover outline-none cursor-pointer transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <Info size={14} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 text-xs font-display text-text-secondary leading-relaxed">
          {definition}
        </PopoverContent>
      </Popover>
    </div>
  );
});
Gauge.displayName = 'Gauge';

const ScopeTag = memo(({ label, scope }: { label: string; scope: CategoryScope }) => (
  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full border border-border/60 bg-surface text-xs font-display font-medium text-text-secondary">
    {label}
    <span className="font-bold text-text">{SCOPE_LABEL[scope]}</span>
  </span>
));
ScopeTag.displayName = 'ScopeTag';

const ScopeChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="flex items-center gap-1 h-8 pl-3 pr-1 rounded-full border border-primary-500/30 bg-primary-500/10 text-xs font-display font-medium text-primary-700 dark:text-primary-300">
    <span className="truncate max-w-[12rem]">{label}</span>
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="flex items-center justify-center size-6 shrink-0 rounded-full hover:bg-primary-500/15 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <X size={13} aria-hidden />
    </button>
  </span>
);

const DONE_RATE_DEFINITION = 'Done rate: items finished out of items created in this period.';
const APPROVAL_DEFINITION = 'Approved in 24h: of the delegations, tickets and checklists handed in for approval in this period, the share the reviewer decided within 24 hours. One still waiting after 24 hours counts as missed.';
const NOT_OVERDUE_DEFINITION = 'On time: of the items that are finished or past their due date, the share that was not late. Items not due yet are left out.';

export const ActivityComplianceGauges = ({ items, activeCategories, groupBy, orgChecklistRate = null, categoryScope }: ActivityComplianceGaugesProps) => {
  const navigate = useNavigate();
  const now = useNow();
  const isMobile = useIsMobile();
  // The scope filters and Export only exist from `sm` up, so nothing they need is fetched on a
  // phone. Their lists (departments, stores, people) are cached org-wide data.
  const showFilters = useMediaQuery('(min-width: 640px)');
  const [selected, setSelected] = useState<GaugeKey | null>(null);
  const [drilldownCategory, setDrilldownCategory] = useState<ActivityCategory | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // "All" until an admin narrows it — Department, Store and Person are independent, combinable
  // scopes (e.g. one department at one store), not tabs. A Department filter is also the
  // practical stand-in for "HOD-wise": an HOD is just a MANAGER who heads a single department
  // (there's no separate HOD field anywhere in the data model), so scoping to their department
  // already shows their compliance.
  const [pickedDepartmentId, setDepartmentId] = useState<string | null>(null);
  const [pickedStoreId, setStoreId] = useState<string | null>(null);
  const [pickedPersonId, setPersonId] = useState<string | null>(null);
  // Hidden filters must not keep narrowing the numbers after the window shrinks to a phone width.
  const departmentId = showFilters ? pickedDepartmentId : null;
  const storeId = showFilters ? pickedStoreId : null;
  const personId = showFilters ? pickedPersonId : null;
  const { data: departmentsData = [] } = useDepartmentsQuery(showFilters);
  const { data: storesData = [] } = useStoresQuery(showFilters);
  const { data: peopleData = [] } = useAssignableUsersQuery(undefined, undefined, undefined, showFilters);
  // The API doesn't guarantee alphabetical order — sorted here, once, rather than making an admin
  // hunt through an arbitrarily-ordered list of every department/store/person in the org.
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

  // The reviewer's own score: how much of what was handed in got a decision within 24 hours, over the
  // same window as the two rings. The card is ADMIN/PC only, so the request is always allowed here.
  const approvalWindow = useMemo(() => {
    const buckets = lastActivityBuckets(groupBy, ACTIVITY_BUCKET_COUNT[groupBy], new Date(now));
    return { from: buckets[0].start.toISOString(), to: buckets[buckets.length - 1].end.toISOString() };
  }, [groupBy, now]);
  const { data: approval } = useApprovalTatQuery(approvalWindow.from, approvalWindow.to, true);
  const approvalDue = approval ? approval.met + approval.breached : 0;
  const approvalBreakdown: CategoryBreakdownRow[] = approval
    ? (['delegation', 'ticket', 'checklist'] as const).map((kind) => ({
        label: ACTIVITY_CATEGORY_LABEL[kind],
        count: approval.byKind[kind].met,
        total: approval.byKind[kind].met + approval.byKind[kind].breached,
      }))
    : [];

  const {
    doneRate, notOverdueRate, doneCount, doneTotal, onTimeCount, dueTotal,
    doneBreakdown, notOverdueBreakdown, doneDelta, notOverdueDelta, trendReady, scoped,
  } = useMemo(() => {
    const buckets = lastActivityBuckets(groupBy, ACTIVITY_BUCKET_COUNT[groupBy], new Date(now));
    const start = buckets[0].start;
    const end = buckets[buckets.length - 1].end;
    // The equivalent window immediately before the one shown — same duration, shifted back — so
    // the change badge compares "these 7 days" against "the 7 days before", not an arbitrary
    // lookback.
    const windowMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - windowMs);
    const prevEnd = start;
    // The last bucket (today, this month...) is only partly over while the window before it is
    // complete, so a change badge is held back until that bucket is at least half done.
    const currentBucket = buckets[buckets.length - 1];
    const ready = isTrendReady(currentBucket.start.getTime(), currentBucket.end.getTime(), now);

    const activeOrder = ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c));
    const inRange = (createdAt: string, rangeStart: Date, rangeEnd: Date) => {
      const t = new Date(createdAt).getTime();
      return t >= rangeStart.getTime() && t < rangeEnd.getTime();
    };
    const scoped = scopedItems.filter((i) => activeCategories.has(i.category) && inRange(i.createdAt, start, end));
    const prevScoped = scopedItems.filter((i) => activeCategories.has(i.category) && inRange(i.createdAt, prevStart, prevEnd));

    // An org checklist figure, when HomePage supplies one, stands in for the user's own runs.
    const orgChecklist = activeCategories.has('checklist') ? orgChecklistRate : null;
    const useOrgChecklist = orgChecklist != null;
    const base = useOrgChecklist ? scoped.filter((i) => i.category !== 'checklist') : scoped;
    const prevBase = useOrgChecklist ? prevScoped.filter((i) => i.category !== 'checklist') : prevScoped;

    const rates = (list: ActivityWorkItem[], extra: { done: number; total: number }) => {
      const doneN = list.filter((i) => i.completed).length + extra.done;
      const totalN = list.length + extra.total;
      const due = list.filter(isDue);
      const onTimeN = due.filter((i) => !isLate(i)).length;
      return { doneN, totalN, onTimeN, dueN: due.length, doneRate: percentOf(doneN, totalN), onTimeRate: percentOf(onTimeN, due.length) };
    };
    const orgExtra = orgChecklist ? { done: orgChecklist.done, total: orgChecklist.total } : { done: 0, total: 0 };
    const current = rates(base, orgExtra);
    // The org figure is for the current window only, so it is left out of the comparison too.
    const previous = rates(prevBase, { done: 0, total: 0 });
    const comparable = !useOrgChecklist;

    const doneBreakdown: CategoryBreakdownRow[] = activeOrder.map((category) => {
      if (category === 'checklist' && orgChecklist) return { label: ACTIVITY_CATEGORY_LABEL[category], count: orgChecklist.done, total: orgChecklist.total };
      const categoryItems = scoped.filter((i) => i.category === category);
      return { label: ACTIVITY_CATEGORY_LABEL[category], count: categoryItems.filter((i) => i.completed).length, total: categoryItems.length };
    });
    const notOverdueBreakdown: CategoryBreakdownRow[] = activeOrder.map((category) => {
      const due = category === 'checklist' && useOrgChecklist ? [] : scoped.filter((i) => i.category === category && isDue(i));
      return { label: ACTIVITY_CATEGORY_LABEL[category], count: due.filter((i) => !isLate(i)).length, total: due.length };
    });

    return {
      doneRate: current.doneRate,
      notOverdueRate: current.onTimeRate,
      doneCount: current.doneN,
      doneTotal: current.totalN,
      onTimeCount: current.onTimeN,
      dueTotal: current.dueN,
      doneBreakdown,
      notOverdueBreakdown,
      doneDelta: ready && comparable ? pointDelta(current.doneRate, previous.doneRate) : null,
      notOverdueDelta: ready && comparable ? pointDelta(current.onTimeRate, previous.onTimeRate) : null,
      trendReady: ready,
      // Kept for drill-down — the exact same time+scope-filtered set the rates above were computed
      // from, so a clicked breakdown row lists precisely the records behind its number.
      scoped,
    };
  }, [scopedItems, activeCategories, groupBy, now, orgChecklistRate]);

  const handleToggle = useCallback((key: GaugeKey) => setSelected((prev) => (prev === key ? null : key)), []);

  const activeBreakdown = selected === 'completion' ? doneBreakdown : selected === 'onTime' ? notOverdueBreakdown : selected === 'approval' ? approvalBreakdown : null;
  const activeLabel = selected === 'completion' ? 'Done rate' : selected === 'onTime' ? 'On time' : selected === 'approval' ? 'Approved in 24h' : null;
  const selectedRate = selected === 'completion' ? doneRate : selected === 'onTime' ? notOverdueRate : (approval?.rate ?? null);
  const rangeText = ACTIVITY_GROUP_RANGE_LABEL[groupBy];
  const deltaTitle = `vs the ${rangeText.replace('last ', '')} before`;

  const departmentName = departments.find((d) => d.id === departmentId)?.name ?? 'All departments';
  const storeName = stores.find((s) => s.id === storeId)?.name ?? 'All stores';
  const personName = (() => {
    const person = people.find((p) => p.id === personId);
    return person ? `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}` : 'All people';
  })();

  const activeList = ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c));
  const isNarrowed = activeList.length < ACTIVITY_CATEGORY_ORDER.length;
  const scopeOf = (c: ActivityCategory): CategoryScope => categoryScope?.[c] ?? DEFAULT_CATEGORY_SCOPE[c];

  // Built from the same numbers the gauges are rendering, not a re-query — an export that
  // disagrees with the card the user is looking at is worse than no export. Percentages go out as
  // numbers so they stay sortable/averageable in a spreadsheet, and a category with nothing in it
  // exports a blank rather than a misleading 0% (the card shows "No data" for the same case).
  const buildExportRows = (): TableRows => {
    const activeLabels = activeList.map((c) => ACTIVITY_CATEGORY_LABEL[c]);

    return [
      ['Completion and on-time export'],
      ['Generated', new Date().toLocaleString()],
      ['Window', `Items created in the ${rangeText}`],
      ['Department', departmentName],
      ['Store', storeName],
      ['Person', personName],
      ['Categories included', activeLabels.join(', ')],
      ['Scope', activeList.map((c) => `${ACTIVITY_CATEGORY_LABEL[c]}: ${SCOPE_LABEL[scopeOf(c)]}`).join(', ')],
      // Only Ticket carries all three scope dimensions, so a scoped export drops whatever lacks
      // the dimension — the same caveat the card shows on screen travels with the file.
      ...(departmentId || storeId || personId
        ? [['Note', 'Scoped view. Items without the filtered dimension (for example Todos) are left out of these totals.']]
        : []),
      ['Note', 'Not overdue counts only items that are finished or past their due date. Open items not yet due are left out.'],
      [],
      ['Category', 'Created', 'Done', 'Done rate %', 'Due items', 'Not overdue', 'Not overdue %'],
      ...doneBreakdown.map((row, i) => {
        const due = notOverdueBreakdown[i];
        return [row.label, row.total, row.count, percentOf(row.count, row.total), due?.total ?? 0, due?.count ?? 0, percentOf(due?.count ?? 0, due?.total ?? 0)];
      }),
      ['All categories', doneTotal, doneCount, doneRate, dueTotal, onTimeCount, notOverdueRate],
      [],
      ['Approval turnaround (24 hour promise)'],
      ['Decided within 24h', approval?.met ?? 0, 'Missed', approval?.breached ?? 0, 'Still waiting', approval?.pending ?? 0, 'Rate %', approval?.rate ?? ''],
    ];
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    const rows = buildExportRows();
    const blob = format === 'csv' ? csvBlob(rows) : xlsxBlob(rows, 'Completion and on-time');
    downloadBlob(blob, stampedFilename('completion-and-on-time', format));
    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  const gaugeSize = isMobile ? 96 : 176;
  // Same list the numbers came from, narrowed to what the open gauge counts (due items only for
  // Not overdue), so the drill-down never lists an item the percentage ignored.
  const drilldownRows = drilldownCategory
    ? scoped.filter((i) => i.category === drilldownCategory && (selected === 'onTime' ? isDue(i) : true))
    : [];

  return (
    // `@container` drives the wide-width split below off this card's own measured width rather
    // than the viewport, so it behaves correctly regardless of the sidebar's state.
    <section aria-labelledby="compliance-heading" className={`@container ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7 flex flex-col gap-5`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <EntityIconTile icon={Sparkles} tone="coral" />
          <div>
            <h2 id="compliance-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Completion and on-time</h2>
            {/* Shown on every screen size: the range is what tells a reader these are items
                created in the window, not everything finished in it. */}
            <p className="text-xs font-medium text-text-muted mt-0.5">Of items created in the {rangeText}</p>
          </div>
        </div>

        {/* Downloads exactly what's on screen — current scope filters, current category filters,
            current window. Generated in the browser (see lib/exportTable) rather than through the
            server's /reports export, because these figures are computed here and a server-side
            recomputation could hand back numbers that don't match the gauges. */}
        {showFilters && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Export completion and on-time data" className="shrink-0 self-start sm:self-auto">
                <Download size={14} strokeWidth={2.5} aria-hidden="true" />
                Export
              </Button>
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
        )}
      </div>

      {/* Which categories feed these numbers and whose work each one covers. */}
      <div className="flex flex-wrap items-center gap-1.5" aria-label="What these numbers cover">
        {isNarrowed && (
          <span className="inline-flex items-center h-6 px-2 rounded-full bg-primary-500/10 text-xs font-display font-bold text-primary-700 dark:text-primary-300">
            Filtered: {activeList.map((c) => ACTIVITY_CATEGORY_LABEL[c]).join(', ')}
          </span>
        )}
        {activeList.map((c) => (
          <ScopeTag key={c} label={ACTIVITY_CATEGORY_LABEL[c]} scope={scopeOf(c)} />
        ))}
      </div>

      {/* Department, Store and Person live behind one Filters button (same pattern as the
          Verification page), with what is applied shown as removable chips. Mounted from `sm` up
          only, so a phone never fetches the lists for filters it cannot see. */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <OptionsSheet
            isOpen={filtersOpen}
            setIsOpen={setFiltersOpen}
            activeCount={(departmentId ? 1 : 0) + (storeId ? 1 : 0) + (personId ? 1 : 0)}
            subtitle="Narrow the numbers to one department, store or person"
            onReset={() => { setDepartmentId(null); setStoreId(null); setPersonId(null); }}
            canReset={!!(departmentId || storeId || personId)}
            showLabel="Show results"
          >
            <OptionSection icon={Building2} label="Department" aside={departmentId ? <ChoiceClear onClick={() => setDepartmentId(null)} /> : undefined}>
              <ChoiceWrap>
                {departments.map((d) => (
                  <ChoiceChip key={d.id} active={departmentId === d.id} onClick={() => setDepartmentId(departmentId === d.id ? null : d.id)} lead={<ChoiceIcon icon={Building2} tone="bg-primary-600" />}>
                    {d.name}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>
            <OptionSection icon={Store} label="Store" aside={storeId ? <ChoiceClear onClick={() => setStoreId(null)} /> : undefined}>
              <ChoiceWrap>
                {stores.map((st) => (
                  <ChoiceChip key={st.id} active={storeId === st.id} onClick={() => setStoreId(storeId === st.id ? null : st.id)} lead={<ChoiceIcon icon={Store} tone="bg-primary-600" />}>
                    {st.name}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>
            <OptionSection icon={User} label="Person" aside={personId ? <ChoiceClear onClick={() => setPersonId(null)} /> : undefined}>
              <Combobox
                value={personId ?? ''}
                onChange={(v) => setPersonId(v || null)}
                options={people.map((pe) => ({ value: pe.id, label: `${pe.firstName}${pe.lastName ? ` ${pe.lastName}` : ''}` }))}
                emptyOptionLabel="All people"
                placeholder="Search people..."
              />
            </OptionSection>
          </OptionsSheet>

          {departmentId && <ScopeChip label={departmentName} onRemove={() => setDepartmentId(null)} />}
          {storeId && <ScopeChip label={storeName} onRemove={() => setStoreId(null)} />}
          {personId && <ScopeChip label={personName} onRemove={() => setPersonId(null)} />}

          {/* Only Ticket carries all three scope dimensions: narrowing by any of them drops
              categories that don't have it rather than matching them against the wrong thing.
              Surfaced here so a shrunk total reads as expected rather than broken. */}
          {(departmentId || storeId || personId) && (
            <p className="text-xs font-medium text-text-muted basis-full sm:basis-auto">
              Scoped: leaves out items with no {[departmentId && 'department', storeId && 'store', personId && 'assignee'].filter(Boolean).join(' or ')}.
            </p>
          )}
        </div>
      )}

      {/* Gauges: a centered pair, capped so they read as a cluster of circles rather than drifting
          apart on a wide monitor. Tapping one opens the breakdown in a modal. */}
      <div className="flex justify-center">
        <div className={`grid grid-cols-2 gap-2.5 sm:gap-6 w-full ${approval ? 'sm:grid-cols-3 max-w-3xl' : 'max-w-xl'}`}>
          <Gauge
            gaugeKey="completion"
            icon={ClipboardCheck}
            label="Done rate"
            definition={DONE_RATE_DEFINITION}
            percent={doneRate}
            caption={`${doneCount} of ${doneTotal} done`}
            volume={doneTotal}
            delta={doneDelta}
            deltaTitle={deltaTitle}
            isSelected={selected === 'completion'}
            size={gaugeSize}
            onToggle={handleToggle}
          />
          <Gauge
            gaugeKey="onTime"
            icon={ShieldCheck}
            label="On time"
            definition={NOT_OVERDUE_DEFINITION}
            percent={notOverdueRate}
            caption={`${onTimeCount} of ${dueTotal} due`}
            volume={dueTotal}
            delta={notOverdueDelta}
            deltaTitle={deltaTitle}
            isSelected={selected === 'onTime'}
            size={gaugeSize}
            onToggle={handleToggle}
          />
          {approval && (
            <div className="col-span-2 sm:col-span-1 max-sm:mx-auto max-sm:w-1/2 max-sm:min-w-40">
              <Gauge
                gaugeKey="approval"
                icon={Timer}
                label="Approved in 24h"
                definition={APPROVAL_DEFINITION}
                percent={approval.rate}
                caption={`${approval.met} of ${approvalDue} in 24h${approval.pending > 0 ? ` \u00b7 ${approval.pending} waiting` : ''}`}
                volume={approvalDue}
                delta={null}
                deltaTitle=""
                isSelected={selected === 'approval'}
                size={gaugeSize}
                onToggle={handleToggle}
              />
            </div>
          )}
        </div>
      </div>

      {!trendReady && (
        <p className="text-xs font-medium text-text-muted text-center">Change vs the last period shows once this one is half over.</p>
      )}

      {activeCategories.has('checklist') && (
        <p className="text-xs font-medium text-text-muted text-center">
          Checklist compliance (good answers) is in{' '}
          <Link to="/admin/checklist-compliance" className="font-bold text-text-secondary underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-sm">
            Admin &gt; Checklist Compliance
          </Link>
          .
        </p>
      )}

      {/* Tapping a ring opens its full breakdown, then picking a category inside drills one level
          further into the item list. Both views live in this ONE Modal (never two stacked
          Dialogs) so that second step is an instant content swap. */}
      {activeBreakdown && activeLabel && (
        <Modal
          open={selected !== null}
          onClose={() => { setSelected(null); setDrilldownCategory(null); }}
          title={drilldownCategory ? `${ACTIVITY_CATEGORY_LABEL[drilldownCategory]}: ${activeLabel}` : `${activeLabel} by category`}
          description={`Items created in the ${rangeText}`}
          // One fixed size/spacing across both views, so the modal doesn't resize under the user
          // between the two steps.
          size="md"
          bodyClassName="gap-3"
          // This sits on top of the exact gauge it is explaining, so being able to drag it aside
          // to compare against the chart underneath is worth having.
          draggable
          footer={
            drilldownCategory && (
              <DrilldownViewAllButton
                href={CATEGORY_VIEW_ALL_HREF[drilldownCategory]}
                label={`View all ${ACTIVITY_CATEGORY_LABEL[drilldownCategory].toLowerCase()}s`}
                onSelect={(link) => { setSelected(null); setDrilldownCategory(null); navigate(link); }}
              />
            )
          }
        >
          {drilldownCategory ? (
            <DrilldownList
              rows={drilldownRows}
              onSelect={(link) => { setSelected(null); setDrilldownCategory(null); navigate(link); }}
            />
          ) : (
            <>
              <div className="flex items-center gap-4 pb-1">
                <div className="flex items-center justify-center size-16 rounded-full border-4 border-primary-700/90 shrink-0 text-center">
                  <span className="font-display font-black text-text tabular-nums text-base">
                    {selectedRate != null ? `${selectedRate}%` : 'None'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-display font-bold text-text">
                    {selected === 'completion'
                      ? `${doneCount} of ${doneTotal} done`
                      : selected === 'onTime'
                        ? `${onTimeCount} of ${dueTotal} due items on time`
                        : `${approval?.met ?? 0} of ${approvalDue} approvals within 24 hours`}
                  </p>
                  <p className="text-xs font-medium text-text-muted">
                    {selected === 'completion' ? DONE_RATE_DEFINITION : selected === 'onTime' ? NOT_OVERDUE_DEFINITION : APPROVAL_DEFINITION}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                <BreakdownRatioRows
                  rows={activeBreakdown}
                  // The approval rows are counts of hand-ins, not item lists, so they do not drill down.
                  onRowClick={selected === 'approval' ? undefined : (label) => setDrilldownCategory(LABEL_TO_CATEGORY[label])}
                />
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
};
