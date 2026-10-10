import { memo } from 'react';
import { AlertTriangle, CheckCircle2, CornerUpLeft, Flag, Gauge, ImageOff } from 'lucide-react';
import { IconChip } from '../../components';
import { cn } from '@/lib/utils';
import type { ChecklistRisk } from './verificationModel';

const complianceTone = (percent: number) => (percent >= 90 ? 'bg-success' : percent >= 70 ? 'bg-warning' : 'bg-danger');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface RiskChipsProps {
  risk: ChecklistRisk;
  className?: string;
}

// The "should I open this one?" read-out on a checklist row: how well it was answered, what is
// missing, whether it was sent back before, and a green "No issues" tag when there is nothing to check.
export const RiskChips = memo(function RiskChips({ risk, className }: RiskChipsProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {risk.criticalFailed > 0 && (
        <IconChip
          icon={Flag}
          tone="bg-danger"
          label={risk.criticalFailed === 1 ? 'Critical question failed' : `${risk.criticalFailed} critical questions failed`}
          className="border-danger/40 bg-danger/10"
          title="A question marked critical was not answered acceptably"
        />
      )}
      {/* No accepted-answer rules means nothing could fail: it shows 100%, not a missing chip. */}
      <IconChip icon={Gauge} tone={complianceTone(risk.compliance ?? 100)} label={`Compliance ${risk.compliance ?? 100}%`} />
      {risk.badAnswers > 0 && (
        <IconChip icon={AlertTriangle} tone="bg-warning" label={plural(risk.badAnswers, 'bad answer', 'bad answers')} title="Answers outside the accepted rule" />
      )}
      {risk.missingPhotos > 0 && (
        <IconChip
          icon={ImageOff}
          tone="bg-danger"
          label={plural(risk.missingPhotos, 'missing photo', 'missing photos')}
          title="Questions that need photos and have fewer than required"
        />
      )}
      {risk.sentBackTimes > 0 && (
        <IconChip
          icon={CornerUpLeft}
          tone="bg-danger"
          label={risk.sentBackTimes === 1 ? 'Sent back once' : `Sent back ${risk.sentBackTimes} times`}
          title="Total times questions in this run were sent back"
        />
      )}
      {risk.clean && <IconChip icon={CheckCircle2} tone="bg-success" label="No issues" title="Fully compliant, photos in, never sent back" />}
    </div>
  );
});
