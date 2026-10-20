import { useState } from 'react';
import { useOrgToday } from '../useOrgToday';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '../../../components';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { cn } from '@/lib/utils';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { PERIOD_LABEL, windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';
import { useChecklistReportDownload } from '../report/useChecklistReport';
import type { ChecklistReportGrouping } from '../../../api/checklistReports';

const PERIODS: readonly ScorePeriod[] = ['week', 'month', 'quarter', 'year'];

const GROUPINGS: { value: ChecklistReportGrouping; label: string; hint: string }[] = [
  { value: 'person', label: 'Per person', hint: 'One row for each person' },
  { value: 'department', label: 'Per department', hint: 'One row for each department' },
  { value: 'both', label: 'Both', hint: 'Excel gets two sheets. CSV is one table, so it gets the people.' },
];

interface WeeklyExportMenuProps {
  storeId?: string;
  departmentId?: string;
  storeName?: string;
  departmentName?: string;
  period?: ScorePeriod;
  offset?: number;
}

export const WeeklyExportMenu = ({ storeId, departmentId, storeName, departmentName, period: pagePeriod, offset: pageOffset }: WeeklyExportMenuProps) => {
  const [open, setOpen] = useState(false);
  const [ownPeriod, setPeriod] = useState<ScorePeriod>('week');
  const [ownOffset, setOffset] = useState(0);
  const followsPage = pagePeriod !== undefined && pageOffset !== undefined;
  const period = followsPage ? pagePeriod : ownPeriod;
  const offset = followsPage ? pageOffset : ownOffset;
  const [groupBy, setGroupBy] = useState<ChecklistReportGrouping>('person');
  const download = useChecklistReportDownload();

  const range = windowFor(period, offset, useOrgToday());
  const run = (format: 'csv' | 'xlsx') =>
    download.mutate({ params: { from: range.from, to: range.to, storeId, departmentId, groupBy }, format }, { onSuccess: () => setOpen(false) });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Export the report" className="h-11 rounded-xl shrink-0">
          <Download size={16} strokeWidth={2.5} aria-hidden="true" />
          Export
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] flex flex-col gap-4 p-4">
        <div>
          <h3 className="t-card font-display font-bold text-text">Export report</h3>
          <p className="t-meta font-medium text-text-muted mt-0.5">
            {storeName ?? 'All stores'}, {departmentName ?? 'all departments'}
          </p>
        </div>

        {followsPage ? (
          <div className="flex flex-col gap-1">
            <span className="t-meta font-display font-semibold text-text-secondary">Period</span>
            <p className="rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2 text-sm font-display font-bold text-text">{range.label}</p>
            <p className="t-meta font-medium text-text-muted">The same period as the page. Change it on the page to export a different one.</p>
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">Period</span>
          <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill />
          <div className="flex items-center justify-between gap-1">
            <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="t-meta font-display font-bold text-text text-center">{range.label}</span>
            <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text disabled:opacity-40 disabled:hover:border-border">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">Group by</span>
          <div role="radiogroup" aria-label="Group by" className="grid grid-cols-3 gap-1.5">
            {GROUPINGS.map((g) => (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={groupBy === g.value}
                onClick={() => setGroupBy(g.value)}
                className={cn(
                  'min-h-10 pointer-coarse:min-h-11 rounded-lg border px-2 t-meta font-display font-bold transition-colors',
                  groupBy === g.value ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border text-text-muted hover:border-border-hover hover:text-text',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="t-meta font-medium text-text-muted">{GROUPINGS.find((g) => g.value === groupBy)?.hint}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={download.isPending} onClick={() => run('csv')} className="h-11 gap-2">
            <FileText size={14} aria-hidden="true" />
            CSV
          </Button>
          <Button disabled={download.isPending} onClick={() => run('xlsx')} className="h-11 gap-2">
            <FileSpreadsheet size={14} aria-hidden="true" />
            {download.isPending ? 'Preparing' : 'Excel'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
