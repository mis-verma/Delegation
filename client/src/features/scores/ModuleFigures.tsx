import { SCORE_LABEL, SCORE_LABEL_SHORT, complianceLabel, complianceLabelShort, type ScoreModule } from '../../lib/scoreLabels';
import { HowCalculated } from './HowCalculated';
import { ScorePct } from './ScorePct';

interface ModuleFiguresProps {
  module: ScoreModule;
  completion: number | null;
  compliance: number | null;
  onTime: number | null;
}

/**
 * The three figures of one module, the same in the total card, a row's popup and the Scorecard: Completion, the
 * module's own second measure (Answers right or Met deadline) and On time, each with its "?". A phone gets the
 * short words so three columns fit at 360px; from sm up the full names.
 */
export const ModuleFigures = ({ module, completion, compliance, onTime }: ModuleFiguresProps) => {
  const items = [
    { key: 'completion', label: SCORE_LABEL.completion, short: SCORE_LABEL_SHORT.completion, value: completion },
    { key: 'compliance', label: complianceLabel(module), short: complianceLabelShort(module), value: compliance },
    { key: 'onTime', label: SCORE_LABEL.onTime, short: SCORE_LABEL_SHORT.onTime, value: onTime },
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="flex flex-wrap items-center gap-x-0.5 t-meta text-text-muted">
            <span className="sm:hidden">{f.short}</span>
            <span className="hidden sm:inline">{f.label}</span>
            <HowCalculated figure={f.key} module={module} />
          </dt>
          <dd className="t-figure font-display"><ScorePct value={f.value} strong /></dd>
        </div>
      ))}
    </dl>
  );
};
