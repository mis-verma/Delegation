import { SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../components';
import { exportTitle } from '../../lib/exportTable';
import { HOW_LINE_LABEL, HOW_LINE_ORDER, howCalculated } from '../../lib/scoreLabels';
import { usePeriodReportQuery } from '../checklist/hook';
import { FillMatrix } from '../checklist/instance/FillMatrix';
import { fillMatrixRows } from '../checklist/instance/fillMatrixState';
import { HintPopover } from './HowCalculated';

const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 366;

interface ScoresFillMatrixProps {
  from: string;
  to: string;
  today: string;
  windowLabel: string;
  storeId?: string;
  departmentId?: string;
  storeName?: string;
  departmentName?: string;
  filtered: boolean;
  onClearFilters: () => void;
}

export const ScoresFillMatrix = ({ from, to, today, windowLabel, storeId, departmentId, storeName, departmentName, filtered, onClearFilters }: ScoresFillMatrixProps) => {
  const tooLong = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS > MAX_SPAN_DAYS;
  const { data, isPending, isError, isPlaceholderData, refetch } = usePeriodReportQuery(from, to, storeId, departmentId, !tooLong);
  const how = howCalculated('completion', 'checklist');

  return (
    <div className="flex flex-col gap-3" aria-busy={isPlaceholderData}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <h3 className="t-card font-display font-bold text-text">Daily checklists</h3>
            <HintPopover label="How the fill matrix is counted">
              <p className="t-card font-display font-bold text-text">Fill matrix</p>
              <p><span className="font-semibold text-text">Rings: </span>one ring is one daily run on one day. Green is filled on time, orange is filled late, red is not filled.</p>
              {HOW_LINE_ORDER.map((k) => (
                <p key={k}>
                  <span className="font-semibold text-text">{HOW_LINE_LABEL[k]}: </span>
                  {how[k]}
                </p>
              ))}
            </HintPopover>
          </div>
          <p className="t-meta text-text-muted">Only daily checklists are in the matrix. Weekly and monthly ones are in the list.</p>
        </div>
        <ExportMenu
          disabled={!data?.rows.length}
          aria-label="Export the daily fill matrix"
          label="Fill matrix"
          filename="scores-fill-matrix"
          sheetName="Fill matrix"
          title={exportTitle({ what: 'Scores, daily fill matrix', from, to, period: windowLabel, filters: { Store: storeName, Department: departmentName } })}
          getRows={() => (data ? fillMatrixRows(data) : [])}
        />
      </div>

      {tooLong ? (
        <EmptyState size="compact" icon={SearchX} title="The matrix covers up to one year" description="Pick a shorter period to see it." />
      ) : isError && !data ? (
        <InlineError message="Could not load the fill matrix." onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4')} role="status" aria-label="Loading the fill matrix">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : data && data.rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={SearchX}
          title="No daily checklists in this period"
          description={filtered ? 'Try another period, or clear the filters.' : 'Try another period.'}
          action={filtered ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
        />
      ) : data ? (
        <>
          <FillMatrix data={data} today={today} label={windowLabel} />
          {isPlaceholderData && <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These rings are for the previous period until {windowLabel} loads.</p>}
        </>
      ) : null}
    </div>
  );
};
