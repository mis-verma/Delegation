import { Building2, Medal, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip, PANEL_CLASS } from '../../components';
import type { ExplorerRow } from '../../api/scores';
import { MODULE_LABEL, type ScoreModule } from '../../lib/scoreLabels';
import { CARD_PAD } from './controlStyles';
import { ScorePct } from './ScorePct';

interface DepartmentStandingProps {
  rows: readonly ExplorerRow[];
  ranks: ReadonlyMap<string, number>;
  homeId: string;
  total: ExplorerRow;
  modules: readonly ScoreModule[];
}

const barTone = (value: number) => (value >= 80 ? 'bg-success' : value >= 50 ? 'bg-warning' : 'bg-danger');

const ModuleBar = ({ module, mine, org }: { module: ScoreModule; mine: ExplorerRow; org: ExplorerRow }) => {
  const own = mine[module];
  const all = org[module];
  if (own.due === 0) return null;
  const value = own.score ?? 0;
  const orgValue = all.due > 0 ? all.score : null;
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-meta font-display font-semibold text-text-secondary">{MODULE_LABEL[module]}</span>
        <span className="t-card font-display"><ScorePct value={own.score} strong /></span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-hover" role="img" aria-label={`${MODULE_LABEL[module]}: your department ${Math.round(value)} percent${orgValue !== null ? `, organisation ${Math.round(orgValue)} percent` : ''}`}>
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', barTone(value))} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        {orgValue !== null && <span className="absolute inset-y-0 w-0.5 bg-text/60" style={{ left: `${Math.max(0, Math.min(100, orgValue))}%` }} aria-hidden="true" />}
      </div>
      <p className="t-meta text-text-muted">{orgValue !== null ? <>Organisation <ScorePct value={orgValue} /></> : 'No organisation figure'}</p>
    </li>
  );
};

export const DepartmentStanding = ({ rows, ranks, homeId, total, modules }: DepartmentStandingProps) => {
  const home = rows.find((r) => r.id === homeId);
  if (!home || home.totalDue === 0) return null;
  const rank = ranks.get(home.id);
  const ranked = rows.filter((r) => r.rankable && r.overall !== null).length;
  const gap = home.overall !== null && total.overall !== null ? Math.round(home.overall - total.overall) : null;
  const GapIcon = gap === null || gap === 0 ? Minus : gap > 0 ? TrendingUp : TrendingDown;
  const gapTone = gap === null || gap === 0 ? 'bg-text-muted' : gap > 0 ? 'bg-success' : 'bg-danger';
  const gapLabel = gap === null ? 'No comparison yet' : gap === 0 ? 'Level with the organisation' : `${Math.abs(gap)} ${Math.abs(gap) === 1 ? 'point' : 'points'} ${gap > 0 ? 'above' : 'below'} the organisation`;
  return (
    <section aria-label="Where your department stands" className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white"><Medal className="size-5" aria-hidden="true" /></span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="t-section font-display font-bold text-text line-clamp-2">{home.name}</h2>
            <p className="t-meta text-text-muted">
              {rank !== undefined && ranked > 0 ? `Ranked ${rank} of ${ranked} departments` : 'Not ranked yet'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconChip icon={Building2} tone="bg-primary-600" soft label="Your department" />
          <IconChip icon={GapIcon} tone={gapTone} soft label={gapLabel} />
        </div>
      </div>
      <ul className={cn('grid grid-cols-1 gap-3', modules.length > 1 && 'md:grid-cols-3')}>
        {modules.map((m) => <ModuleBar key={m} module={m} mine={home} org={total} />)}
      </ul>
      <p className="t-meta text-text-muted">The thin line on each bar is the whole organisation.</p>
    </section>
  );
};
