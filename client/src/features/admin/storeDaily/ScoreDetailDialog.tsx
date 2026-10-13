import { CheckCheck, ShieldCheck } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { NEEDS_ATTENTION_BELOW } from '../analytics/useOwnerRankings';
import { formatPercent } from '../analytics/analyticsDisplay';
import { cn } from '@/lib/utils';
import { rateOf, type ScoreDetail } from './scoreFigures';
import { ScoreRunsList } from './ScoreRunsList';

const GOOD_FROM = 80;
const toneText = (rate: number | null) =>
  rate == null ? 'text-text-light' : rate >= GOOD_FROM ? 'text-success' : rate >= NEEDS_ATTENTION_BELOW ? 'text-warning' : 'text-danger';
const toneBar = (rate: number | null) =>
  rate == null ? 'bg-border' : rate >= GOOD_FROM ? 'bg-success' : rate >= NEEDS_ATTENTION_BELOW ? 'bg-warning' : 'bg-danger';

const Measure = ({
  icon: Icon, label, rate, detail, help,
}: { icon: typeof CheckCheck; label: string; rate: number | null; detail: string; help: string }) => (
  <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/40 p-3.5">
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-sm font-display font-bold text-text">{label}</span>
      <span className={cn('ml-auto text-2xl font-display font-bold tabular-nums leading-none', toneText(rate))}>{formatPercent(rate)}</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-border/70" role="img" aria-label={`${label} ${formatPercent(rate)}`}>
      <div className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', toneBar(rate))} style={{ width: `${Math.min(100, Math.max(0, rate ?? 0))}%` }} />
    </div>
    <p className="text-xs font-display font-medium text-text-secondary">{detail}</p>
    <p className="text-xs font-display text-text-muted">{help}</p>
  </div>
);

/**
 * What one score is made of: the completion and compliance for a store on a day, or a department in
 * a month, with the counts behind each percentage and what the colours mean.
 */
export const ScoreDetailDialog = ({ detail, onClose }: { detail: ScoreDetail | null; onClose: () => void }) => {
  if (!detail) return null;
  const { figures: f } = detail;
  const completion = rateOf(f.done, f.total);
  const compliance = rateOf(f.good, f.scored);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={detail.title}
      description={detail.subtitle}
      icon={<CheckCheck className="size-5" />}
      showCloseButton={false}
      footer={<Button variant="primary" size="sm" onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-3">
        <Measure
          icon={CheckCheck}
          label="Items done"
          rate={completion}
          detail={f.total > 0 ? `${f.done} of ${f.total} questions done` : 'No questions were due'}
          help="Counts questions, not whole checklists. Questions done out of questions due; not applicable ones are left out, and checklists not yet due are not counted."
        />
        <Measure
          icon={ShieldCheck}
          label="Answers right"
          rate={compliance}
          detail={f.scored > 0 ? `${Math.round(f.good)} of ${Math.round(f.scored)} checked answers were right` : 'No answers were checked'}
          help="Compliance: how many checked answers were inside the accepted range. Critical questions count twice, and a question sent back counts as a miss."
        />
        {detail.scope && <ScoreRunsList key={`${detail.scope.from}${detail.scope.to}${detail.scope.storeId ?? ''}${detail.scope.departmentId ?? ''}`} scope={detail.scope} />}
        <p className="text-xs font-display text-text-muted">
          {f.dueRuns} {f.dueRuns === 1 ? 'checklist' : 'checklists'} counted. Green is {GOOD_FROM}% or more, red is below {NEEDS_ATTENTION_BELOW}%.
        </p>
      </div>
    </Modal>
  );
};
