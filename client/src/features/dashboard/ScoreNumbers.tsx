import { memo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scores } from '../../api/scores';
import { Skeleton } from '../../components/skeleton';
import { formatPct, roundPct } from '../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel } from '../../lib/scoreLabels';
import { CATEGORY_ICON, CATEGORY_TILE } from './categoryLook';
import { moduleOverall, numbersFor, type ModuleKey, type ScoreMetric } from './scoreMetrics';
import { TONE_TEXT, TONE_WORD, toneOf } from './scoreTone';

const MODULES: readonly ModuleKey[] = ['checklist', 'ticket', 'delegation'];

interface Cell {
  key: ModuleKey;
  hasData: boolean;
  score: number | null;
  change: number | null;
  detail: string;
}

const cellsFor = (data: Scores, previous: Scores | undefined, metric: ScoreMetric): Cell[] =>
  MODULES.map((key) => {
    const now = numbersFor(data, key);
    const before = previous ? numbersFor(previous, key) : null;
    const pick = (n: ReturnType<typeof numbersFor> | null, fallback: number | null): number | null =>
      n === null ? null : metric === 'completion' ? n.completion : metric === 'compliance' ? n.compliance : metric === 'ontime' ? n.ontime : fallback;
    const score = pick(now, moduleOverall(data, key));
    const prior = pick(before, previous ? moduleOverall(previous, key) : null);
    const note = metric === 'completion' ? now.completionNote : metric === 'compliance' ? now.complianceNote : metric === 'ontime' ? now.ontimeNote : '';
    const detail = metric === 'overview'
      ? `${SCORE_LABEL.completion} ${formatPct(now.completion)}, ${complianceLabel(key).toLowerCase()} ${formatPct(now.compliance)}`
      : note;
    return { key, hasData: now.hasData, score, change: score !== null && prior !== null ? Math.round((score - prior) * 10) / 10 : null, detail };
  });

interface ScoreNumbersProps {
  scores: Scores | undefined;
  previous?: Scores | undefined;
  loading: boolean;
  metric?: ScoreMetric;
  onOpenModule?: (key: ModuleKey) => void;
  emptyText?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
}

export const ScoreNumbers = memo(({ scores, previous, loading, metric = 'overview', onOpenModule, emptyText = 'Nothing due yet', emptyHint, emptyAction }: ScoreNumbersProps) => {
  if (loading && !scores) {
    return (
      <div className="grid grid-cols-1 divide-y divide-border/60 rounded-xl border border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0" role="status" aria-label="Loading scores">
        {MODULES.map((m) => (
          <div key={m} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-14" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const cells = scores ? cellsFor(scores, previous, metric) : [];
  if (cells.length > 0 && cells.every((c) => !c.hasData)) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-hover/50 px-4 py-6 text-center">
        <p className="t-card font-display font-bold text-text">{emptyText}</p>
        {emptyHint && <p className="max-w-md t-meta font-medium text-text-muted">{emptyHint}</p>}
        {emptyAction}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Scores by module">
      {cells.map((cell) => {
        const Icon = CATEGORY_ICON[cell.key];
        const tone = toneOf(cell.score);
        const rounded = roundPct(cell.score);
        const interactive = !!onOpenModule && cell.hasData;
        const label = cell.score === null ? `${MODULE_LABEL[cell.key]}: nothing due` : `${MODULE_LABEL[cell.key]}: ${formatPct(cell.score)}, ${TONE_WORD[tone]}`;
        const body = (
          <>
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white', CATEGORY_TILE[cell.key])} aria-hidden="true">
              <Icon className="size-[1.125rem]" strokeWidth={2.25} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="t-card font-display font-bold text-text">{MODULE_LABEL[cell.key]}</span>
              {cell.hasData && rounded !== null ? (
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>{formatPct(rounded)}</span>
                  <span className={cn('t-meta font-display font-semibold', TONE_TEXT[tone])}>{TONE_WORD[tone]}</span>
                  {cell.change !== null && cell.change !== 0 && (
                    <span className={cn('inline-flex items-center gap-0.5 t-meta font-display font-semibold tabular-nums', cell.change > 0 ? 'text-success' : 'text-danger')} title="Compared with the last period">
                      {cell.change > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
                      {Math.abs(cell.change)} pts
                    </span>
                  )}
                </span>
              ) : (
                <span className="t-meta font-display text-text-light">Nothing due</span>
              )}
              {cell.hasData && cell.detail && <span className="t-meta text-text-muted">{cell.detail}</span>}
            </span>
            {interactive && <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />}
          </>
        );
        const cls = 'flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left';
        return (
          <li key={cell.key}>
            {interactive ? (
              <button
                type="button"
                onClick={() => onOpenModule?.(cell.key)}
                aria-label={`${label}. Open the details`}
                className={`${cls} cursor-pointer outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 active:bg-surface-hover`}
              >
                {body}
              </button>
            ) : (
              <div className={cls} aria-label={label}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
});
ScoreNumbers.displayName = 'ScoreNumbers';
