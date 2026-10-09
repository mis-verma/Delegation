import { useMemo, useState } from 'react';
import { Building2, ClipboardList, Download, FileDown, Layers, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, Combobox, DateRangePicker, EmptyState, InlineError, Modal, Skeleton, ToggleChip, type DateRangeValue } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { useDepartmentsQuery, useStoresQuery } from '../hook';
import { rateToneClass } from '../checklistDisplay';
import { errorMessage } from '../../../lib/queryHelpers';
import { useChecklistReportDownload, useChecklistReportPreview } from './useChecklistReport';
import type { ChecklistReportFormat, ChecklistReportGrouping, ChecklistReportParams } from '../../../api/checklistReports';

type PeriodKey = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last30' | 'custom';

const PERIODS: { key: Exclude<PeriodKey, 'custom'>; label: string }[] = [
  { key: 'thisWeek', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last30', label: 'Last 30 days' },
];

const GROUPINGS: { value: ChecklistReportGrouping; label: string; icon: typeof User }[] = [
  { value: 'person', label: 'Person', icon: User },
  { value: 'department', label: 'Department', icon: Building2 },
  { value: 'both', label: 'Both', icon: Layers },
];

const FORMATS: { value: ChecklistReportFormat; label: string }[] = [
  { value: 'xlsx', label: 'Excel (XLSX)' },
  { value: 'csv', label: 'CSV' },
];

const PREVIEW_ROWS = 8;
const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const FIELD_LABEL = 'text-xs font-display font-medium text-text-secondary';
const CONTROL_H = 'h-11';
// One column template for the header, the rows and the skeleton so they always line up.
// Below sm only Name, Completion and Compliance show (Assigned and On time are in the download), so
// the phone template has three columns and the wide one has five.
const PREVIEW_GRID = 'grid grid-cols-[minmax(0,1fr)_4.5rem_5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5rem_6rem] items-center gap-2 px-3';
const SM_ONLY = 'hidden sm:block';

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const formatDay = (s: string) => fromYmd(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const presetRange = (key: Exclude<PeriodKey, 'custom'>, now = new Date()): { from: string; to: string } => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
  switch (key) {
    case 'thisWeek':
      return { from: toYmd(monday), to: toYmd(today) };
    case 'lastWeek':
      return {
        from: toYmd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)),
        to: toYmd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1)),
      };
    case 'thisMonth':
      return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: toYmd(today) };
    case 'lastMonth':
      return {
        from: toYmd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toYmd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case 'last30':
      return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: toYmd(today) };
  }
};

const PercentCell = ({ value, className }: { value: number | null; className?: string }) =>
  value === null ? (
    <span className={cn('text-right text-xs font-display text-text-light', className)}>
      <span aria-hidden>-</span>
      <span className="sr-only">No data</span>
    </span>
  ) : (
    <span className={cn('text-right text-xs font-display font-semibold tabular-nums', rateToneClass(value), className)}>{value}%</span>
  );

interface PreviewRow {
  key: string;
  name: string;
  sub: string;
  assigned: number;
  completionPct: number | null;
  onTimePct: number | null;
  compliancePct: number | null;
}

const PreviewTable = ({ rows, total, noun, isRefreshing }: { rows: PreviewRow[]; total: number; noun: string; isRefreshing: boolean }) => (
  <div className="flex flex-col gap-2">
    <div className={cn('rounded-lg border border-border/60 overflow-hidden transition-opacity duration-200', isRefreshing && 'opacity-60')}>
      <div className={cn(PREVIEW_GRID, 'py-2 bg-surface-hover/60 border-b border-border/60 t-meta font-display font-medium text-text-muted')}>
        <span>Name</span>
        <span className={cn('text-right', SM_ONLY)}>Assigned</span>
        <span className="text-right">Completion</span>
        <span className={cn('text-right', SM_ONLY)}>On time</span>
        <span className="text-right">Compliance</span>
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((r) => (
          <li key={r.key} className={cn(PREVIEW_GRID, 'h-11 hover:bg-surface-hover/40 transition-colors duration-150')}>
            <span className="flex flex-col min-w-0">
              <span className="text-xs font-display font-medium text-text line-clamp-1">{r.name}</span>
              <span className="t-meta font-display text-text-muted line-clamp-1">{r.sub}</span>
            </span>
            <span className={cn('text-right text-xs font-display text-text-secondary tabular-nums', SM_ONLY)}>{r.assigned}</span>
            <PercentCell value={r.completionPct} />
            <PercentCell value={r.onTimePct} className={SM_ONLY} />
            <PercentCell value={r.compliancePct} />
          </li>
        ))}
      </ul>
    </div>
    <p className="t-meta font-display text-text-muted">
      {total > rows.length ? `Showing the first ${rows.length} of ${total} ${noun}. The download has everyone.` : `${total} ${total === 1 ? noun.replace(/s$/, '') : noun} in the download.`}
    </p>
  </div>
);

const PreviewSkeleton = () => (
  <div className="rounded-lg border border-border/60 overflow-hidden" aria-busy="true">
    <div className={cn(PREVIEW_GRID, 'py-2 bg-surface-hover/60 border-b border-border/60')}>
      <Skeleton className="h-3 w-16" />
    </div>
    <ul className="divide-y divide-border/40">
      {Array.from({ length: PREVIEW_ROWS }, (_, i) => (
        <li key={i} className={cn(PREVIEW_GRID, 'h-11')}>
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className={cn('h-3.5 w-6 justify-self-end', SM_ONLY)} />
          <Skeleton className="h-3.5 w-8 justify-self-end" />
          <Skeleton className={cn('h-3.5 w-8 justify-self-end', SM_ONLY)} />
          <Skeleton className="h-3.5 w-8 justify-self-end" />
        </li>
      ))}
    </ul>
  </div>
);

interface ChecklistReportDialogProps {
  onClose: () => void;
}

export const ChecklistReportDialog = ({ onClose }: ChecklistReportDialogProps) => {
  const { user } = useAuth();
  const isOrgWide = user?.role === 'ADMIN' || user?.role === 'PC';

  const [groupBy, setGroupBy] = useState<ChecklistReportGrouping>('both');
  const [period, setPeriod] = useState<PeriodKey>('last30');
  const [customRange, setCustomRange] = useState<DateRangeValue>({ from: null, to: null });
  const [storeId, setStoreId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [format, setFormat] = useState<ChecklistReportFormat>('xlsx');
  const [previewView, setPreviewView] = useState<'person' | 'department'>('person');

  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data: departments = [], isPending: departmentsPending } = useDepartmentsQuery(isOrgWide);
  const storeOptions = useMemo(() => stores.map((s) => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => departments.map((d) => ({ value: d.id, label: d.name })), [departments]);

  const range = useMemo<{ from: string; to: string } | null>(() => {
    if (period !== 'custom') return presetRange(period);
    if (!customRange.from || !customRange.to) return null;
    return { from: toYmd(customRange.from), to: toYmd(customRange.to) };
  }, [period, customRange]);

  const rangeDays = range ? Math.round((fromYmd(range.to).getTime() - fromYmd(range.from).getTime()) / DAY_MS) + 1 : 0;
  const rangeError = range && rangeDays > MAX_RANGE_DAYS ? `Pick a period of ${MAX_RANGE_DAYS} days or less.` : null;
  const rangeValid = !!range && !rangeError;

  const params: ChecklistReportParams = {
    from: range?.from ?? '',
    to: range?.to ?? '',
    storeId: storeId || undefined,
    departmentId: isOrgWide ? departmentId || undefined : undefined,
    groupBy,
  };

  // The preview always asks for both tables and picks one on screen, so switching "Report by" never
  // refetches (the choice only matters for the download).
  const preview = useChecklistReportPreview({ ...params, groupBy: 'both' }, rangeValid);
  const download = useChecklistReportDownload();

  const report = rangeValid ? preview.data : undefined;
  // With "Both" the preview shows one table at a time; otherwise it follows the chosen grouping.
  const shownView: 'person' | 'department' = groupBy === 'both' ? previewView : groupBy;
  const noData = !!report && (shownView === 'person' ? report.people.length : report.departments.length) === 0;

  const rows = useMemo<PreviewRow[]>(() => {
    if (!report) return [];
    if (shownView === 'person') {
      return report.people.slice(0, PREVIEW_ROWS).map((p) => ({
        key: p.userId, name: p.name, sub: p.department, assigned: p.assigned,
        completionPct: p.completionPct, onTimePct: p.onTimePct, compliancePct: p.compliancePct,
      }));
    }
    return report.departments.slice(0, PREVIEW_ROWS).map((d) => ({
      key: d.departmentId ?? 'none', name: d.department, sub: `${d.people} ${d.people === 1 ? 'person' : 'people'}`, assigned: d.assigned,
      completionPct: d.completionPct, onTimePct: d.onTimePct, compliancePct: d.compliancePct,
    }));
  }, [report, shownView]);
  const totalRows = report ? (shownView === 'person' ? report.people.length : report.departments.length) : 0;

  const handleDownload = () => {
    if (!rangeValid) return;
    download.mutate({ params, format }, { onSuccess: onClose });
  };

  const canDownload = rangeValid && !noData && !download.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      draggable
      size="xl"
      icon={<FileDown className="size-4" aria-hidden />}
      title="Download checklist report"
      description="How well each person and department filled their checklists."
      footer={
        <>
          <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={download.isPending}>
            Cancel
          </Button>
          <Button className="h-11 sm:h-10" onClick={handleDownload} isLoading={download.isPending} disabled={!canDownload}>
            {!download.isPending && <Download size={15} aria-hidden />}
            Download
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <span id="report-by-label" className={FIELD_LABEL}>Report by</span>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as ChecklistReportGrouping)}>
          <TabsList aria-labelledby="report-by-label" className={cn(CONTROL_H, 'w-full')}>
            {GROUPINGS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="h-full text-xs">
                <Icon size={14} aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>Period</span>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <ToggleChip key={p.key} on={period === p.key} onClick={() => setPeriod(p.key)}>
              {p.label}
            </ToggleChip>
          ))}
          <ToggleChip on={period === 'custom'} onClick={() => setPeriod('custom')}>
            Custom
          </ToggleChip>
        </div>
        {/* Same-height slot for both states so picking Custom does not move anything below it. */}
        <div className={cn(CONTROL_H, 'flex items-center')}>
          {period === 'custom' ? (
            <DateRangePicker value={customRange} onChange={setCustomRange} placeholder="Pick a start and end date" className="w-full sm:w-72" />
          ) : (
            range && <p className="text-xs font-display text-text-muted">{formatDay(range.from)} to {formatDay(range.to)}</p>
          )}
        </div>
        {rangeError && <InlineError message={rangeError} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-store" className={FIELD_LABEL}>Store</label>
          <Combobox
            id="report-store"
            value={storeId}
            onChange={setStoreId}
            options={storeOptions}
            emptyOptionLabel="All stores"
            isLoading={storesPending}
            className={cn(CONTROL_H, 'rounded-xl')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-department" className={FIELD_LABEL}>Department</label>
          {isOrgWide ? (
            <Combobox
              id="report-department"
              value={departmentId}
              onChange={setDepartmentId}
              options={departmentOptions}
              emptyOptionLabel="All departments"
              isLoading={departmentsPending}
              className={cn(CONTROL_H, 'rounded-xl')}
            />
          ) : (
            <p id="report-department" className={cn(CONTROL_H, 'flex items-center px-3 rounded-xl border border-border bg-surface-hover/40 text-xs font-display text-text-muted')}>
              Your department only
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="report-format-label" className={FIELD_LABEL}>Format</span>
        <Tabs value={format} onValueChange={(v) => setFormat(v as ChecklistReportFormat)}>
          <TabsList aria-labelledby="report-format-label" className={cn(CONTROL_H, 'w-full sm:w-fit')}>
            {FORMATS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="h-full text-xs sm:px-5">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {format === 'csv' && groupBy === 'both' && (
          <p className="t-meta font-display text-text-muted">A CSV holds one table, so you will get the people table. Pick Excel for both.</p>
        )}
      </div>

      <section aria-label="Preview" className="flex flex-col gap-2 pt-4 border-t border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-card font-display font-bold text-text">Preview</h3>
          {groupBy === 'both' && (
            <div className="flex gap-2">
              <ToggleChip on={previewView === 'person'} onClick={() => setPreviewView('person')}>People</ToggleChip>
              <ToggleChip on={previewView === 'department'} onClick={() => setPreviewView('department')}>Departments</ToggleChip>
            </div>
          )}
        </div>

        {/* Same minimum height in every state (loading, error, empty, rows) so the dialog never resizes. */}
        <div className="min-h-96">
          {!rangeValid ? (
            <EmptyState icon={ClipboardList} title="Pick a period" description="Choose a start and end date to see a preview." className="py-10" />
          ) : preview.isError && !report ? (
            <InlineError message={errorMessage(preview.error, 'Could not load the preview.')} onRetry={() => void preview.refetch()} />
          ) : preview.isPending || !report ? (
            <PreviewSkeleton />
          ) : noData ? (
            <EmptyState icon={ClipboardList} title="No checklists ran in this period" description="Try a longer period or a different store." className="py-10" />
          ) : (
            <PreviewTable rows={rows} total={totalRows} noun={shownView === 'person' ? 'people' : 'departments'} isRefreshing={preview.isFetching} />
          )}
        </div>

        {report && !noData && (
          <p className="t-meta font-display text-text-muted">
            A checklist shared by several people counts for each of them. Compliance is the share of checked answers that were inside the accepted range.
          </p>
        )}
      </section>
    </Modal>
  );
};
