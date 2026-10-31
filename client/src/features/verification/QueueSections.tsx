import { memo } from 'react';
import { Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton, StatusBadge } from '../../components';
import { ALL_LOOK, SECTION_LOOK, type QueueSection } from './sectionLook';
import { formatWaiting, type QueueTab } from './verificationModel';
import { EMPTY_STATS, type SectionStats } from './sectionStats';

interface QueueSectionsProps {
  tab: QueueTab;
  loading: boolean;
  stats: Record<QueueSection, SectionStats>;
  total: number;
  now: number;
  onChange: (tab: QueueTab) => void;
}

interface TileProps {
  pressed: boolean;
  onClick: () => void;
  icon: typeof ALL_LOOK.icon;
  label: string;
  stats: SectionStats;
  tile: string;
  soft: string;
  now: number;
}

const SectionTile = ({ pressed, onClick, icon: Icon, label, stats, tile, soft, now }: TileProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={pressed}
    className={cn(
      'flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border p-2.5 text-left outline-none transition-colors duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:p-3',
      pressed ? soft : 'border-border/60 bg-surface hover:border-border-hover',
    )}
  >
    <span className="flex items-center gap-2.5">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white', tile)} aria-hidden="true">
        <Icon className="size-4.5" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="t-stat font-display font-extrabold tabular-nums leading-none text-text">{stats.count}</span>
        <span className="t-meta font-display font-semibold leading-tight text-text-secondary">{label}</span>
      </span>
    </span>
    <span className="flex flex-wrap items-center gap-1.5">
      {stats.late > 0 && <StatusBadge variant="critical" icon={Hourglass} label={`${stats.late} over 24h`} />}
      {stats.late === 0 && stats.count > 0 && stats.oldest !== null && (
        <span className="t-meta text-text-muted max-sm:hidden">Oldest {formatWaiting(stats.oldest, now)}</span>
      )}
      {stats.count === 0 && <span className="t-meta text-text-muted">All clear</span>}
    </span>
  </button>
);

const SECTIONS: QueueSection[] = ['checklists', 'tickets', 'delegations'];

export const QueueSections = memo(function QueueSections({ tab, loading, stats, total, now, onChange }: QueueSectionsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="status" aria-label="Loading sections">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[5.25rem] rounded-xl" />)}
      </div>
    );
  }
  const everything: SectionStats = {
    count: total,
    late: SECTIONS.reduce((n, s) => n + stats[s].late, 0),
    oldest: SECTIONS.reduce<number | null>((min, s) => {
      const at = stats[s].oldest;
      return at === null ? min : min === null || at < min ? at : min;
    }, null),
  };
  return (
    <nav aria-label="Review sections" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <SectionTile
        pressed={tab === 'all'}
        onClick={() => onChange('all')}
        icon={ALL_LOOK.icon}
        label="Everything"
        stats={everything}
        tile="bg-text-secondary"
        soft="border-text-secondary/50 bg-text-secondary/8"
        now={now}
      />
      {SECTIONS.map((section) => {
        const look = SECTION_LOOK[section];
        return (
          <SectionTile
            key={section}
            pressed={tab === section}
            onClick={() => onChange(tab === section ? 'all' : section)}
            icon={look.icon}
            label={look.label}
            stats={stats[section] ?? EMPTY_STATS}
            tile={cn('bg-linear-to-br', look.tile)}
            soft={look.soft}
            now={now}
          />
        );
      })}
    </nav>
  );
});
