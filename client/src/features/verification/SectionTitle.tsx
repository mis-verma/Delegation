import { CheckCircle2, Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '../../components';
import { SECTION_LOOK, type QueueSection } from './sectionLook';
import { formatWaiting } from './verificationModel';
import type { SectionStats } from './sectionStats';

interface SectionTitleProps {
  section: QueueSection;
  stats: SectionStats;
  now: number;
  className?: string;
}

export const SectionTitle = ({ section, stats, now, className }: SectionTitleProps) => {
  const look = SECTION_LOOK[section];
  const Icon = look.icon;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white', look.tile)} aria-hidden="true">
        <Icon className="size-4.5" strokeWidth={2.25} />
      </span>
      <h2 className="t-section font-display font-bold text-text">{look.label}</h2>
      <StatusBadge variant="neutral" icon={false} label={stats.count} />
      {stats.count > 0 && (
        stats.late > 0
          ? <StatusBadge variant="critical" icon={Hourglass} label={`${stats.late} over 24h`} />
          : <StatusBadge variant="success" icon={CheckCircle2} label="None late" />
      )}
      {stats.oldest !== null && <span className="t-meta text-text-muted max-sm:hidden">Oldest {formatWaiting(stats.oldest, now)}</span>}
    </div>
  );
};
