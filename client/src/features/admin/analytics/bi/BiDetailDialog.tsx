import { useEffect, useMemo } from 'react';
import { ChevronRight, ListTree, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerModule, ExplorerRow, ExplorerView, MatrixBucket, MatrixCell, MatrixParams, MatrixPeriod } from '../../../../api/scores';
import { Button, ExportMenu, InlineError, Modal, Skeleton } from '../../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../../lib/exportTable';
import { formatPct, roundPct } from '../../../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL, SCORE_LABEL_SHORT, complianceLabel, complianceLabelShort } from '../../../../lib/scoreLabels';
import { CATEGORY_ICON, CATEGORY_TILE } from '../../../dashboard/categoryLook';
import { TONE_TEXT, toneOf } from '../../../dashboard/scoreTone';
import { drillTargets } from '../../../scores/scoresDisplay';
import { bucketTitle } from './biTimeUtils';
import type { DetailRow } from './biMetrics';
import { ScoreRing } from './ScoreRing';
import { useBiMatrix } from './useBiMatrix';

const ORDER: readonly ExplorerModule[] = ['delegation', 'ticket', 'checklist'];

export interface BiDetail {
  row: DetailRow;
  bucketIndex: number | null;
}

interface BiDetailDialogProps {
  detail: BiDetail | null;
  win: { from: string; to: string; label: string };
  matrixParams: MatrixParams | null;
  onClose: () => void;
  onDrill: (row: Pick<ExplorerRow, 'id' | 'name' | 'kind'>, view: ExplorerView) => void;
  onZoom: (bucket: MatrixBucket) => void;
}

const PERIOD_LABEL_SR: Record<MatrixPeriod, string> = { day: 'day by day', week: 'week by week', month: 'month by month' };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'row';
const cellPct = (value: number | null) => (roundPct(value) === null ? '-' : formatPct(value));

interface BodyProps extends Omit<BiDetailDialogProps, 'detail'> {
  detail: BiDetail;
}

const Body = ({ detail, win, matrixParams, onClose, onZoom }: BodyProps) => {
  const { row, bucketIndex } = detail;
  const query = useBiMatrix(matrixParams);
  const matrix = query.data;
  const cells = useMemo<(MatrixCell | null)[]>(() => {
    if (!matrix) return [];
    return row.id === 'total' ? matrix.total.cells : matrix.rows.find((r) => r.id === row.id)?.cells ?? [];
  }, [matrix, row.id]);
  const period = matrix?.period ?? 'day';

  useEffect(() => {
    if (bucketIndex === null || !matrix) return;
    document.getElementById(`bi-detail-period-${bucketIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [bucketIndex, matrix]);

  const pickedBucket = bucketIndex !== null ? matrix?.buckets[bucketIndex] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta font-medium text-text-muted">
        {win.label}
        {row.departmentName && row.kind === 'person' ? ` · ${row.departmentName}` : ''}
        {pickedBucket ? ` · You picked ${bucketTitle(period, pickedBucket)}` : ''}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ORDER.map((m) => {
          const b = row.whole[m];
          const Icon = CATEGORY_ICON[m];
          const tone = toneOf(b.due === 0 ? null : b.score);
          return (
            <section key={m} aria-label={MODULE_LABEL[m]} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-white', CATEGORY_TILE[m])} aria-hidden="true">
                    <Icon className="size-4" strokeWidth={2.25} />
                  </span>
                  <h3 className="t-card font-display font-bold text-text">{MODULE_LABEL[m]}</h3>
                </span>
                <span className={cn('t-card font-display font-extrabold tabular-nums', TONE_TEXT[tone])} title={SCORE_LABEL.overall}>
                  {b.due === 0 ? 'N/A' : cellPct(b.score)}
                </span>
              </div>
              {b.due === 0 ? (
                <p className="t-meta font-medium text-text-muted">Nothing was due.</p>
              ) : (
                <>
                  <div className="flex items-start justify-around gap-2">
                    <figure className="flex flex-col items-center gap-1">
                      <ScoreRing value={b.completion} size={64} stroke={7} label={`${MODULE_LABEL[m]} ${SCORE_LABEL.completion}`} />
                      <figcaption className="t-meta font-display font-semibold text-text-secondary">{SCORE_LABEL.completion}</figcaption>
                    </figure>
                    <figure className="flex flex-col items-center gap-1">
                      <ScoreRing value={b.compliance} size={64} stroke={7} label={`${MODULE_LABEL[m]} ${complianceLabel(m)}`} />
                      <figcaption className="t-meta font-display font-semibold text-text-secondary">{complianceLabel(m)}</figcaption>
                    </figure>
                  </div>
                  <p className="t-meta font-medium text-text-muted tabular-nums">
                    {b.done} of {b.due} done · {b.late} late · {SCORE_LABEL.onTime} {cellPct(b.onTime)}
                  </p>
                </>
              )}
            </section>
          );
        })}
      </div>

      <section aria-label="Period by period" className="flex flex-col gap-2">
        <h3 className="t-card font-display font-bold text-text">By {period}</h3>
        {query.isError && !matrix ? (
          <InlineError message="Could not load the breakdown." onRetry={() => void query.refetch()} />
        ) : !matrix ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : cells.length === 0 ? (
          <p className="t-meta font-medium text-text-muted">No breakdown is available for this row.</p>
        ) : (
          <div className="max-h-72 overflow-auto overscroll-contain rounded-xl border border-border/60">
            <table className="w-full border-separate border-spacing-0 t-meta">
              <caption className="sr-only">{row.name}, {PERIOD_LABEL_SR[period]} figures</caption>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <th scope="col" rowSpan={2} className="sticky left-0 z-10 min-w-28 border-b border-border/60 bg-surface px-3 py-2 text-left font-display font-semibold text-text-muted">Period</th>
                  {ORDER.map((m) => (
                    <th key={m} scope="colgroup" colSpan={2} className="border-b border-l border-border/60 px-2 py-1 text-center font-display font-bold text-text-secondary">{MODULE_LABEL[m]}</th>
                  ))}
                  <th scope="col" rowSpan={2} className="border-b border-l border-border/60 px-2 py-2 text-center font-display font-semibold text-text-muted"><span className="sr-only">Zoom</span></th>
                </tr>
                <tr>
                  {ORDER.flatMap((m) => [
                    <th key={`${m}-c`} scope="col" className="border-b border-l border-border/60 px-2 py-1 text-right font-display font-semibold text-text-muted">{SCORE_LABEL_SHORT.completion}</th>,
                    <th key={`${m}-q`} scope="col" className="border-b border-border/60 px-2 py-1 text-right font-display font-semibold text-text-muted">{complianceLabelShort(m)}</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {cells.map((cell, i) => {
                  const bucket = matrix.buckets[i];
                  if (!bucket) return null;
                  const picked = bucketIndex === i;
                  return (
                    <tr key={i} id={`bi-detail-period-${i}`} className={cn(picked && 'bg-primary-500/10')}>
                      <th scope="row" className="sticky left-0 border-b border-border/40 bg-surface px-3 py-1.5 text-left font-display font-semibold text-text">
                        <span className={cn('block', picked && 'text-primary-700 dark:text-primary-300')}>{bucketTitle(period, bucket)}</span>
                      </th>
                      {ORDER.flatMap((m) => {
                        const completion = cell && cell[m].due > 0 ? cell[m].completion : null;
                        const compliance = cell && cell[m].due > 0 ? cell[m].compliance : null;
                        return [
                          <td key={`${m}-c`} className={cn('border-b border-l border-border/40 px-2 py-1.5 text-right tabular-nums', TONE_TEXT[toneOf(completion)])}>{cellPct(completion)}</td>,
                          <td key={`${m}-q`} className={cn('border-b border-border/40 px-2 py-1.5 text-right tabular-nums', TONE_TEXT[toneOf(compliance)])}>{cellPct(compliance)}</td>,
                        ];
                      })}
                      <td className="border-b border-l border-border/40 px-1 py-0.5 text-center">
                        {matrix.buckets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              onZoom(bucket);
                              onClose();
                            }}
                            aria-label={`Zoom the page to ${bucketTitle(period, bucket)}`}
                            title="Zoom the page to this period"
                            className="flex size-8 items-center justify-center rounded-md text-text-muted outline-none cursor-pointer hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-coarse:size-11"
                          >
                            <ZoomIn size={14} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export const BiDetailDialog = ({ detail, win, matrixParams, onClose, onDrill, onZoom }: BiDetailDialogProps) => {
  const query = useBiMatrix(detail ? matrixParams : null);
  const matrix = query.data;

  const buildRows = (): { rows: TableRows; count: number } => {
    if (!detail) return { rows: [], count: 0 };
    const w = detail.row.whole;
    const summaryHead = ['Module', 'Due', 'Done', 'Late', `${SCORE_LABEL.completion} %`, 'Compliance %', `${SCORE_LABEL.onTime} %`, 'Score %'];
    const summary: (string | number | null)[][] = ORDER.map((m) => {
      const b = w[m];
      return [MODULE_LABEL[m], b.due, b.done, b.late, exportPct(b.completion), exportPct(b.compliance), exportPct(b.onTime), exportPct(b.score)];
    });
    summary.push(['All modules', w.totalDue, null, null, null, null, null, exportPct(w.overall)]);

    const cells = matrix ? (detail.row.id === 'total' ? matrix.total.cells : matrix.rows.find((r) => r.id === detail.row.id)?.cells ?? []) : [];
    const breakdown: (string | number | null)[][] = [];
    if (matrix && cells.length) {
      breakdown.push([], [
        `By ${matrix.period}`,
        ...ORDER.flatMap((m) => [`${MODULE_LABEL[m]} ${SCORE_LABEL.completion.toLowerCase()} %`, `${MODULE_LABEL[m]} ${complianceLabel(m).toLowerCase()} %`]),
      ]);
      cells.forEach((cell, i) => {
        const bucket = matrix.buckets[i];
        if (!bucket) return;
        breakdown.push([
          bucketTitle(matrix.period, bucket),
          ...ORDER.flatMap((m) => (cell && cell[m].due > 0 ? [exportPct(cell[m].completion), exportPct(cell[m].compliance)] : [null, null])),
        ]);
      });
    }
    return { rows: [summaryHead, ...summary, ...breakdown], count: summary.length + Math.max(0, breakdown.length - 2) };
  };

  const targets = detail ? drillTargets(detail.row) : [];

  return (
    <Modal
      open={!!detail}
      onClose={onClose}
      draggable
      size="3xl"
      icon={<ListTree className="h-5 w-5" />}
      title={detail?.row.name ?? ''}
      bodyClassName="max-h-[75dvh] overflow-y-auto"
      footer={detail && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {targets.map((t) => (
              <Button
                key={t.view}
                type="button"
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={() => {
                  onClose();
                  onDrill(detail.row, t.view);
                }}
              >
                {t.label}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu
              aria-label={`Export ${detail.row.name}`}
              filename={`overview-${slug(detail.row.name)}`}
              sheetName="Overview"
              title={exportTitle({ what: `Overview, ${detail.row.name}`, from: win.from, to: win.to, period: win.label })}
              getRows={buildRows}
            />
            <Button type="button" size="sm" variant="primary" onClick={onClose} className="pointer-coarse:min-h-11">Close</Button>
          </div>
        </div>
      )}
    >
      {detail && <Body detail={detail} win={win} matrixParams={matrixParams} onClose={onClose} onDrill={onDrill} onZoom={onZoom} />}
    </Modal>
  );
};
