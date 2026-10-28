import { memo } from 'react';
import { AlertTriangle, CheckCircle2, Copy, CornerUpLeft, Flag, Gauge, History, ImageOff, Ticket } from 'lucide-react';
import { IconChip } from '../../components';
import { cn } from '@/lib/utils';
import type { ChecklistRisk } from './verificationModel';

const complianceTone = (percent: number) => (percent >= 90 ? 'bg-success' : percent >= 70 ? 'bg-warning' : 'bg-danger');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface RiskChipsProps {
  risk: ChecklistRisk;
  className?: string;
  hideCompliance?: boolean;
}

export const RiskChips = memo(function RiskChips({ risk, className, hideCompliance = false }: RiskChipsProps) {
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
      {!hideCompliance && <IconChip icon={Gauge} tone={complianceTone(risk.compliance ?? 100)} label={`Compliance ${risk.compliance ?? 100}%`} />}
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
      {risk.reusedPhotos > 0 && (
        <IconChip
          icon={Copy}
          tone="bg-danger"
          label={plural(risk.reusedPhotos, 'reused photo', 'reused photos')}
          title="Photos that look the same as ones uploaded earlier for another question"
        />
      )}
      {risk.oldPhotos > 0 && (
        <IconChip
          icon={History}
          tone="bg-warning"
          label={plural(risk.oldPhotos, 'old photo', 'old photos')}
          title="Photos that were taken before this checklist opened"
        />
      )}
      {risk.weakPhotos > 0 && (
        <IconChip
          icon={ImageOff}
          tone="bg-warning"
          label={plural(risk.weakPhotos, 'weak photo', 'weak photos')}
          title="Photos that look blurry, too dark or too bright"
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
      {risk.ticketsRaised > 0 && (
        <IconChip icon={Ticket} tone="bg-danger" label={plural(risk.ticketsRaised, 'ticket raised', 'tickets raised')} title="Tickets raised on answers in this run" />
      )}
      {risk.clean && <IconChip icon={CheckCircle2} tone="bg-success" label="No issues" title="Fully compliant, photos in, never sent back" />}
    </div>
  );
});
