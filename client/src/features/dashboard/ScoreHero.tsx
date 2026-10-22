import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RadialGauge } from '../../components/radialGauge/RadialGauge';
import { CountUp } from '../../components/countUp';
import { IconChip } from '../../components/iconChip';
import { Skeleton } from '../../components/skeleton';
import { formatPct, roundPct } from '../../lib/percent';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { type HeroFacts } from './heroFacts';
import { ToneChip } from './ToneChip';
import { TONE_COLOR, TONE_SOFT, TONE_TEXT, toneOf } from './scoreTone';

const HEADLINE = {
  success: 'Strong work. Keep it steady.',
  warning: 'Getting there. A little more to go.',
  danger: 'Needs attention. Start with what is late.',
  neutral: 'Scores start once something comes due.',
} as const;

interface ScoreHeroProps {
  facts: HeroFacts;
  loading: boolean;
  changePts?: number | null;
  title?: string;
  className?: string;
}

export const ScoreHero = ({ facts, loading, changePts = null, title = 'Overall score', className }: ScoreHeroProps) => {
  const { overall, best, weakest } = facts;
  const tone = toneOf(overall);
  const rounded = roundPct(overall);
  const change = changePts === null ? null : Math.round(changePts * 10) / 10;
  return (
    <div className={cn('stat-rise flex items-center gap-3.5 rounded-xl border bg-linear-to-br to-transparent p-3 @lg:gap-5 @lg:p-4', TONE_SOFT[tone], className)}>
      <RadialGauge
        percent={overall ?? 0}
        size={104}
        variant="circle"
        thickness={10}
        gradientFrom={TONE_COLOR[tone]}
        gradientTo={TONE_COLOR[tone]}
        ariaLabel={`${title} ${overall === null ? 'not available' : formatPct(overall)}`}
        className="shrink-0"
      >
        {loading ? (
          <Skeleton className="h-7 w-14 rounded-md" />
        ) : (
          <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', overall === null ? 'text-text-light' : 'text-text')}>
            {rounded === null ? '-' : <CountUp value={rounded} decimals={1} fromZero format={(n) => `${n}%`} />}
          </span>
        )}
      </RadialGauge>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="t-section font-display font-bold leading-tight text-text">{title}</span>
          {overall !== null && <ToneChip tone={tone} />}
          {change !== null && (
            <IconChip
              icon={change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus}
              tone={change > 0 ? 'bg-success' : change < 0 ? 'bg-danger' : 'bg-text-muted'}
              label={change === 0 ? 'No change' : `${Math.abs(change)} pts`}
              labelClassName={cn('tabular-nums', change > 0 ? 'text-success' : change < 0 ? 'text-danger' : undefined)}
              title="Compared with the last period"
            />
          )}
        </div>
        <p className={cn('t-card font-display font-semibold leading-snug', overall === null ? 'text-text-muted' : TONE_TEXT[tone])}>{HEADLINE[tone]}</p>
        {(best || weakest) && (
          <div className="flex flex-wrap gap-1.5">
            {best && <IconChip icon={CircleCheck} tone="bg-success" label={`Best: ${MODULE_LABEL[best.key]} ${formatPct(best.score)}`} labelClassName="tabular-nums" />}
            {weakest && <IconChip icon={CircleAlert} tone="bg-warning" label={`Focus: ${MODULE_LABEL[weakest.key]} ${formatPct(weakest.score)}`} labelClassName="tabular-nums" />}
          </div>
        )}
      </div>
    </div>
  );
};
