import { cn } from '@/lib/utils';
import { SCORE_LABEL, SCORE_LABEL_SHORT, complianceLabel, complianceLabelShort, type ScoreModule } from '../../lib/scoreLabels';
import { HowCalculated } from './HowCalculated';
import { ScorePct } from './ScorePct';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

interface ModuleFiguresProps {
  module: ScoreModule;
  completion: number | null;
  compliance: number | null;
  onTime: number | null;
}

const barTone = (value: number | null) => (value === null ? 'bg-border-hover' : value >= GOOD_FROM ? 'bg-success' : value >= FAIR_FROM ? 'bg-warning' : 'bg-danger');

export const ModuleFigures = ({ module, completion, compliance, onTime }: ModuleFiguresProps) => {
  const items = [
    { key: 'completion', label: SCORE_LABEL.completion, short: SCORE_LABEL_SHORT.completion, value: completion },
    { key: 'compliance', label: complianceLabel(module), short: complianceLabelShort(module), value: compliance },
    { key: 'onTime', label: SCORE_LABEL.onTime, short: SCORE_LABEL_SHORT.onTime, value: onTime },
  ] as const;
  return (
    <dl className="@container grid grid-cols-3 gap-2">
      {items.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/50 bg-surface-hover/30 p-2.5">
          <dt className="flex min-w-0 items-center gap-x-0.5 whitespace-nowrap t-meta text-text-muted">
            <span className="@[22rem]:hidden">{f.short}</span>
            <span className="hidden @[22rem]:inline min-w-0 truncate">{f.label}</span>
            <HowCalculated figure={f.key} module={module} />
          </dt>
          <dd className="t-stat font-display leading-tight"><ScorePct value={f.value} strong /></dd>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
            <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', barTone(f.value))} style={{ width: `${f.value === null ? 0 : Math.max(4, Math.min(100, f.value))}%` }} />
          </span>
        </div>
      ))}
    </dl>
  );
};
