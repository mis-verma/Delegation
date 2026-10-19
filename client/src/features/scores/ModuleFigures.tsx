import { SCORE_LABEL, SCORE_LABEL_SHORT, complianceLabel, complianceLabelShort, type ScoreModule } from '../../lib/scoreLabels';
import { HowCalculated } from './HowCalculated';
import { ScorePct } from './ScorePct';

interface ModuleFiguresProps {
  module: ScoreModule;
  completion: number | null;
  compliance: number | null;
  onTime: number | null;
}

export const ModuleFigures = ({ module, completion, compliance, onTime }: ModuleFiguresProps) => {
  const items = [
    { key: 'completion', label: SCORE_LABEL.completion, short: SCORE_LABEL_SHORT.completion, value: completion },
    { key: 'compliance', label: complianceLabel(module), short: complianceLabelShort(module), value: compliance },
    { key: 'onTime', label: SCORE_LABEL.onTime, short: SCORE_LABEL_SHORT.onTime, value: onTime },
  ] as const;
  return (
    <dl className="@container grid grid-cols-3 gap-3">
      {items.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="flex min-w-0 items-center gap-x-0.5 whitespace-nowrap t-meta text-text-muted">
            <span className="@[22rem]:hidden">{f.short}</span>
            <span className="hidden @[22rem]:inline min-w-0 truncate">{f.label}</span>
            <HowCalculated figure={f.key} module={module} />
          </dt>
          <dd className="t-stat font-display leading-tight"><ScorePct value={f.value} strong /></dd>
        </div>
      ))}
    </dl>
  );
};
