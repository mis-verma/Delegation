import { memo } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { complianceToneClass } from '../checklist/checklistDisplay';
import type { ReviewScores } from './reviewScore';

interface ReviewScoreStripProps {
  scores: ReviewScores;
  reviewed: number;
  total: number;
  compact?: boolean;
  className?: string;
}

const pct = (n: number | null) => (n === null ? 'No rules' : `${n}%`);

export const ReviewScoreStrip = memo(function ReviewScoreStrip({ scores, reviewed, total, compact = false, className }: ReviewScoreStripProps) {
  const { now, ifSentBack } = scores;
  const reviewedPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const nowLabel = now.compliance === null ? 'No answer rules to score' : `${now.compliance}% answers right now`;
  const projectedLabel = ifSentBack && ifSentBack.compliance !== null ? `, ${ifSentBack.compliance}% if sent back` : '';

  return (
    <div className={cn('flex flex-col gap-2', className)} role="group" aria-label="Live score">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums" aria-live="polite">
          <span className="sr-only">{nowLabel}{projectedLabel}.</span>
          <span aria-hidden className={cn('font-display font-extrabold', compact ? 't-card' : 't-stat', now.compliance === null ? 'text-text-muted' : complianceToneClass(now.compliance))}>
            {pct(now.compliance)}
          </span>
          {!compact && <span aria-hidden className="t-meta font-display font-medium text-text-muted">answers right</span>}
          {ifSentBack && ifSentBack.compliance !== null && ifSentBack.compliance !== now.compliance && (
            <span aria-hidden className="inline-flex items-baseline gap-1 t-meta font-display font-semibold text-text-secondary">
              <ArrowRight size={12} className="self-center text-text-muted" />
              <span className={complianceToneClass(ifSentBack.compliance)}>{ifSentBack.compliance}%</span>
              if sent back
            </span>
          )}
        </p>
        <span className="t-meta font-display font-medium text-text-muted tabular-nums">
          {reviewed} of {total} checked{compact ? '' : ` · ${now.completion}% filled`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
        <div
          className="h-full w-full origin-left rounded-full bg-primary-500 transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${reviewedPct / 100})` }}
        />
      </div>
    </div>
  );
});
