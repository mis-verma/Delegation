import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, DateRangePicker, type DateRangeValue } from '../../components';
import { useReportExportMutation } from './useReportExport';
import { computeRange, PRESET_LABELS, type ReportPreset } from './dateRangePresets';
import { endOfDay } from '../../lib/dateRange';
import type { ReportModule, ReportFormat, ReportExportParams } from '../../api/reports';

const PRESETS: ReportPreset[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const FORMATS: ReportFormat[] = ['csv', 'xlsx'];

type RangeMode = ReportPreset | 'custom';

type TaskExportFilters = Pick<ReportExportParams, 'category' | 'status' | 'priority' | 'departmentId' | 'assigneeIds'>;

interface ReportExportPanelProps {
  reportModule: ReportModule;
  description: string;
  /** Current page filters (category/status/priority/department/assignee) to scope the export to
   *  what's on screen — e.g. TaskList's active filters, so "Export" doesn't silently ignore them. */
  filters?: TaskExportFilters;
}

export const ReportExportPanel = ({ reportModule, description, filters }: ReportExportPanelProps) => {
  const [mode, setMode] = useState<RangeMode>('monthly');
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [customRange, setCustomRange] = useState<DateRangeValue>({ from: null, to: null });
  const exportMutation = useReportExportMutation(reportModule);

  const isCustom = mode === 'custom';
  const canDownload = !isCustom || (!!customRange.from && !!customRange.to);

  const handleDownload = () => {
    if (!canDownload) return;

    const { from, to } = isCustom
      ? { from: customRange.from!.toISOString(), to: endOfDay(customRange.to!).toISOString() }
      : computeRange(mode, new Date());

    exportMutation.mutate({ from, to, format, ...filters });
  };

  return (
    <div className="flex flex-col gap-5 p-5 rounded-xl border border-border/60 bg-surface">
      <p className="text-xs text-text-muted font-display">{description}</p>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-display font-medium text-text-secondary uppercase tracking-wider">
          Period
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMode(p)}
              className={`px-3 py-1.5 text-xs font-display font-medium rounded-md border transition-all cursor-pointer ${
                mode === p
                  ? 'border-primary-500/60 bg-primary-500/10 text-primary-500 font-medium'
                  : 'border-border/60 bg-surface text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-3 py-1.5 text-xs font-display font-medium rounded-md border transition-all cursor-pointer ${
              isCustom
                ? 'border-primary-500/60 bg-primary-500/10 text-primary-500 font-medium'
                : 'border-border/60 bg-surface text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Custom Range
          </button>
        </div>

        {isCustom && (
          <div className="pt-1">
            <DateRangePicker value={customRange} onChange={setCustomRange} placeholder="Select a date range" />
          </div>
        )}
      </div>

      {/* Format Toggle */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-display font-medium text-text-secondary uppercase tracking-wider">
          Format
        </span>
        <div className="flex gap-1 p-1 bg-surface-hover rounded-lg w-fit">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`px-3 py-1.5 text-xs font-display font-medium rounded-md transition-colors cursor-pointer uppercase ${
                format === f ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Button
        size="sm"
        variant="primary"
        className="self-start gap-1.5 font-display text-xs"
        onClick={handleDownload}
        isLoading={exportMutation.isPending}
        disabled={!canDownload || exportMutation.isPending}
      >
        {!exportMutation.isPending && <Download size={14} />}
        {exportMutation.isPending ? 'Preparing download…' : `Download ${isCustom ? 'Selected Range' : PRESET_LABELS[mode]}`}
      </Button>
    </div>
  );
};
