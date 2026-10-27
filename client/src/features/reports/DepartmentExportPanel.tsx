import { useMemo, useState } from 'react';
import { Download, Layers } from 'lucide-react';
import { Button, NoticeBanner, Segmented, SelectDropdown } from '../../components';
import { useDepartmentReportMutation } from './useReportExport';
import { useExportRange } from './useExportRange';
import { ExportField, FormatField, PeriodField } from './ExportFields';
import { useDepartmentsQuery } from '../tickets/hook';
import type {
  DepartmentReportContent,
  DepartmentReportGranularity,
  DepartmentReportModule,
  ReportExportParams,
  ReportFormat,
} from '../../api/reports';
import type { ReportPreset } from './dateRangePresets';

const PRESETS: readonly ReportPreset[] = ['weekly', 'monthly', 'lastMonth', 'quarterly', 'yearly', 'allTime'];

const ALL_DEPARTMENTS = 'all-departments';

const GRANULARITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
] as const;

const CONTENT_OPTIONS = [
  { value: 'summary', label: 'Summary' },
  { value: 'periods', label: 'By period' },
  { value: 'details', label: 'All records' },
] as const;

const CONTENT_HINT: Record<'csv' | 'pdf', Record<DepartmentReportContent, string>> = {
  csv: {
    summary: 'One row per department with counts, overdue, on-time rate and average days to finish.',
    periods: 'One row per department and week or month, ready to pivot or chart.',
    details: 'Every record in the period, one per row.',
  },
  pdf: {
    summary: 'A printable page with the department table and the week or month breakdown.',
    periods: 'A printable table with one row per department and week or month.',
    details: 'Every record in the period, up to 5,000 rows. Use Excel for more.',
  },
};

type Filters = Pick<ReportExportParams, 'category' | 'status' | 'priority' | 'departmentId' | 'assigneeIds'>;

interface DepartmentExportPanelProps {
  reportModule: DepartmentReportModule;
  description: string;
  filters?: Filters;
}

export const DepartmentExportPanel = ({ reportModule, description, filters }: DepartmentExportPanelProps) => {
  const range = useExportRange('monthly');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const [content, setContent] = useState<DepartmentReportContent>('summary');
  const [granularity, setGranularity] = useState<DepartmentReportGranularity>('auto');
  const [departmentId, setDepartmentId] = useState(ALL_DEPARTMENTS);
  const { data: departments = [] } = useDepartmentsQuery();
  const exportMutation = useDepartmentReportMutation(reportModule);

  const departmentOptions = useMemo(
    () => [
      { value: ALL_DEPARTMENTS, label: 'All departments' },
      ...departments
        .filter((d) => d.isActive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ value: d.id, label: d.name })),
    ],
    [departments],
  );

  const noun = reportModule === 'tickets' ? 'tickets' : 'delegations';

  const handleDownload = () => {
    if (!range.ready) return;
    exportMutation.mutate({
      ...filters,
      ...range.resolve(),
      format,
      content,
      granularity,
      ...(departmentId !== ALL_DEPARTMENTS ? { departmentId } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface p-4 sm:p-5">
      <p className="t-meta text-text-muted">{description}</p>

      <PeriodField presets={PRESETS} mode={range.mode} onMode={range.setMode} customRange={range.customRange} onCustomRange={range.setCustomRange} />

      <ExportField label="Department">
        <SelectDropdown
          value={departmentId}
          onChange={setDepartmentId}
          options={departmentOptions}
          aria-label={`Department to export ${noun} for`}
        />
      </ExportField>

      <ExportField label="Group by" hint="Auto uses weeks for short periods and months for longer ones.">
        <Segmented label="Group by" options={GRANULARITY_OPTIONS} value={granularity} onChange={setGranularity} className="w-fit" />
      </ExportField>

      <FormatField value={format} onChange={setFormat} />

      {format === 'xlsx' ? (
        <NoticeBanner tone="info" icon={Layers}>
          One Excel file with three sheets: Summary by department, By period, and every record.
        </NoticeBanner>
      ) : (
        <ExportField label="What to download" hint={CONTENT_HINT[format][content]}>
          <Segmented label="What to download" options={CONTENT_OPTIONS} value={content} onChange={setContent} className="w-fit" />
        </ExportField>
      )}

      <Button
        variant="primary"
        className="w-full gap-1.5 font-display pointer-coarse:min-h-11 sm:w-fit"
        onClick={handleDownload}
        isLoading={exportMutation.isPending}
        disabled={!range.ready || exportMutation.isPending}
      >
        {!exportMutation.isPending && <Download size={15} aria-hidden="true" />}
        {exportMutation.isPending ? 'Preparing download…' : `Download ${range.label}`}
      </Button>
    </div>
  );
};
