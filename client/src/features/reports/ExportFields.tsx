import type { ReactNode } from 'react';
import { CalendarRange, FileSpreadsheet, FileText, Table, type LucideIcon } from 'lucide-react';
import { DateRangePicker, IconChip, Segmented, ToggleChip, type DateRangeValue } from '../../components';
import { PRESET_LABELS, type ReportPreset } from './dateRangePresets';
import type { RangeMode } from './useExportRange';
import type { ReportFormat } from '../../api/reports';

export const ExportField = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <span className="t-meta font-display font-semibold text-text-secondary">{label}</span>
    {children}
    {hint && <p className="t-meta text-text-muted">{hint}</p>}
  </div>
);

interface PeriodFieldProps {
  presets: readonly ReportPreset[];
  mode: RangeMode;
  onMode: (mode: RangeMode) => void;
  customRange: DateRangeValue;
  onCustomRange: (range: DateRangeValue) => void;
}

export const PeriodField = ({ presets, mode, onMode, customRange, onCustomRange }: PeriodFieldProps) => (
  <ExportField label="Period">
    <div role="group" aria-label="Period" className="flex flex-wrap gap-1.5">
      {presets.map((preset) => (
        <ToggleChip key={preset} on={mode === preset} onClick={() => onMode(preset)}>
          {PRESET_LABELS[preset]}
        </ToggleChip>
      ))}
      <ToggleChip on={mode === 'custom'} onClick={() => onMode('custom')}>
        Custom range
      </ToggleChip>
    </div>
    {mode === 'custom' && <DateRangePicker value={customRange} onChange={onCustomRange} placeholder="Select a date range" />}
  </ExportField>
);

const FORMAT_OPTIONS = [
  { value: 'xlsx', label: 'Excel', icon: <FileSpreadsheet className="size-3.5" aria-hidden="true" /> },
  { value: 'pdf', label: 'PDF', icon: <FileText className="size-3.5" aria-hidden="true" /> },
  { value: 'csv', label: 'CSV', icon: <Table className="size-3.5" aria-hidden="true" /> },
] as const;

export const FormatField = ({ value, onChange }: { value: ReportFormat; onChange: (format: ReportFormat) => void }) => (
  <ExportField label="Format">
    <Segmented label="File format" options={FORMAT_OPTIONS} value={value} onChange={onChange} className="w-fit" />
  </ExportField>
);

const FORMAT_LOOK: Record<ReportFormat, { label: string; icon: LucideIcon; tone: string }> = {
  xlsx: { label: 'Excel file', icon: FileSpreadsheet, tone: 'bg-success' },
  pdf: { label: 'PDF file', icon: FileText, tone: 'bg-danger' },
  csv: { label: 'CSV file', icon: Table, tone: 'bg-primary-700 dark:bg-primary-400' },
};

export type ExportScopeChip = { key: string; icon: LucideIcon; label: string };

export const ExportSummary = ({ period, format, scope }: { period: string; format: ReportFormat; scope: ExportScopeChip[] }) => {
  const look = FORMAT_LOOK[format];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-hover/40 p-3">
      <span className="t-meta font-display font-semibold text-text-secondary">Your file</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <IconChip icon={CalendarRange} tone="bg-primary-800 dark:bg-primary-400" label={period} />
        <IconChip icon={look.icon} tone={look.tone} label={look.label} />
        {scope.map((chip) => <IconChip key={chip.key} icon={chip.icon} tone="bg-coral-500" label={chip.label} />)}
      </div>
    </div>
  );
};
