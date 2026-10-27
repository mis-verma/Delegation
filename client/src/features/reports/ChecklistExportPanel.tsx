import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, SelectDropdown } from '../../components';
import { useReportExportMutation } from './useReportExport';
import { useExportRange } from './useExportRange';
import { ExportField, FormatField, PeriodField } from './ExportFields';
import { useStoresQuery, useAssignableUsersQuery } from '../checklist/hook';
import type { ReportFormat } from '../../api/reports';
import type { ReportPreset } from './dateRangePresets';

const PRESETS: readonly ReportPreset[] = ['daily', 'weekly', 'monthly', 'lastMonth', 'quarterly', 'yearly'];

const NO_STORE_FILTER = 'all-stores';
const NO_PERSON_FILTER = 'all-people';

export const ChecklistExportPanel = ({ description }: { description: string }) => {
  const range = useExportRange('monthly');
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [storeId, setStoreId] = useState(NO_STORE_FILTER);
  const [assigneeId, setAssigneeId] = useState(NO_PERSON_FILTER);
  const { data: stores = [] } = useStoresQuery();
  const { data: people = [] } = useAssignableUsersQuery(undefined, storeId === NO_STORE_FILTER ? undefined : storeId);
  const exportMutation = useReportExportMutation('checklists');

  const handleDownload = () => {
    if (!range.ready) return;
    exportMutation.mutate({
      ...range.resolve(),
      format,
      ...(storeId !== NO_STORE_FILTER ? { storeId } : {}),
      ...(assigneeId !== NO_PERSON_FILTER ? { assigneeIds: [assigneeId] } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface p-4 sm:p-5">
      <p className="t-meta text-text-muted">{description}</p>

      <PeriodField presets={PRESETS} mode={range.mode} onMode={range.setMode} customRange={range.customRange} onCustomRange={range.setCustomRange} />

      <ExportField label="Scope">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectDropdown
            value={storeId}
            onChange={setStoreId}
            options={[{ value: NO_STORE_FILTER, label: 'All stores' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
            aria-label="Scope export to a store"
          />
          <SelectDropdown
            value={assigneeId}
            onChange={setAssigneeId}
            options={[
              { value: NO_PERSON_FILTER, label: 'All people' },
              ...people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName ?? ''}`.trim() })),
            ]}
            aria-label="Scope export to a person"
          />
        </div>
      </ExportField>

      <FormatField value={format} onChange={setFormat} />

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
