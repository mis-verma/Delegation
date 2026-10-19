import { cn } from '@/lib/utils';
import { PANEL_CLASS, Skeleton } from '../../components';
import { CARD_PAD } from './controlStyles';
import type { ExplorerRow } from '../../api/scores';
import { MODULE_LABEL, SCORE_LABEL, type ScoreModule } from '../../lib/scoreLabels';
import { HowCalculated } from './HowCalculated';
import { ModuleFigures } from './ModuleFigures';
import { CountsLine, ScorePct } from './ScorePct';

interface ScoresTotalCardProps {
  total: ExplorerRow;
  modules: readonly ScoreModule[];
  title: string;
  windowLabel: string;
  capped: boolean;
}

const ModuleBlock = ({ module, row }: { module: ScoreModule; row: ExplorerRow }) => {
  const b = row[module];
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="t-card font-display font-bold text-text">{MODULE_LABEL[module]}</h3>
        <span className="t-meta text-text-muted tabular-nums">{b.due} due</span>
      </div>
      {b.due === 0 ? (
        <p className="t-meta text-text-muted">Nothing due in this period</p>
      ) : (
        <>
          <ModuleFigures module={module} completion={b.completion} compliance={b.compliance} onTime={b.onTimeOfFinishedPct} />
          <CountsLine done={b.done} late={b.late} notDone={b.notDone} open={b.open} />
        </>
      )}
    </div>
  );
};

export const ScoresTotalCard = ({ total, modules, title, windowLabel, capped }: ScoresTotalCardProps) => (
  <section aria-label={`${title}, totals`} className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="t-section font-display font-bold text-text line-clamp-2">{title}</h2>
        <p className="t-meta text-text-muted">
          {windowLabel}
          {capped ? ', counted up to today' : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="t-stat font-display"><ScorePct value={total.overall} strong /></span>
        <span className="flex items-center gap-0.5 t-meta text-text-muted">
          {SCORE_LABEL.overall}
          <HowCalculated figure="overall" />
        </span>
      </div>
    </div>
    <div className={cn('grid grid-cols-1 gap-3', modules.length > 1 && 'md:grid-cols-3')}>
      {modules.map((m) => <ModuleBlock key={m} module={m} row={total} />)}
    </div>
  </section>
);

export const ScoresTotalSkeleton = () => (
  <div className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)} role="status" aria-label="Loading the totals">
    <Skeleton className="h-10 w-2/3 rounded-lg" />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
    </div>
  </div>
);
