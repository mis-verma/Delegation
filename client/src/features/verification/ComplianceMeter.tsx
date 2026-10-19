import { memo } from 'react';
import { cn } from '@/lib/utils';
import { complianceToneClass } from '../checklist/checklistDisplay';
import type { ChecklistRisk } from './verificationModel';

interface ComplianceMeterProps {
  risk: ChecklistRisk;
  className?: string;
}

export const ComplianceMeter = memo(function ComplianceMeter({ risk, className }: ComplianceMeterProps) {
  const percent = risk.compliance ?? 100;
  const critical = risk.criticalFailed;
  const wrong = Math.max(0, risk.scored - risk.good - critical);
  const noRule = Math.max(0, risk.answered - risk.scored);
  const open = Math.max(0, risk.totalQuestions - risk.answered);
  const segments = [
    { key: 'good', n: risk.good, cls: 'bg-success' },
    { key: 'wrong', n: wrong, cls: 'bg-warning' },
    { key: 'critical', n: critical, cls: 'bg-danger' },
    { key: 'norule', n: noRule, cls: 'bg-text-muted/40' },
    { key: 'open', n: open, cls: 'bg-border' },
  ].filter((s) => s.n > 0);
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.n, 0));
  const summary = risk.scored > 0 ? `${risk.good} of ${risk.scored} answers right` : 'No answer rules to check';
  const detail = [critical > 0 && `${critical} critical`, wrong > 0 && `${wrong} wrong`, noRule > 0 && `${noRule} not scored`, open > 0 && `${open} not done`].filter(Boolean).join(', ');

  return (
    <div
      role="img"
      aria-label={`Compliance ${percent}%. ${summary}${detail ? `, ${detail}` : ''}`}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', complianceToneClass(percent))}>{percent}%</span>
          <span className="t-meta font-display font-semibold text-text-muted">compliance</span>
        </span>
        <span className="t-meta font-display font-medium text-text-secondary text-right">{summary}</span>
      </div>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {segments.length === 0 ? (
          <span className="h-full w-full rounded-full bg-border" />
        ) : (
          segments.map((s) => <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.cls)} style={{ width: `${(s.n / total) * 100}%` }} />)
        )}
      </div>
      {detail && <p className="t-meta font-display text-text-muted">{detail}</p>}
    </div>
  );
});
