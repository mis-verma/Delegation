import { memo, useMemo } from 'react';
import { Building2, Layers, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../../components';
import { useAssignableUsersQuery } from '../hook';
import { floorPoints, totalPoints, type PointScorable } from '../pointsScore';
import { complianceToneClass } from '../checklistDisplay';

interface AuditScorePanelProps {
  items: readonly PointScorable[];
  className?: string;
}

const Figure = ({ earned, max, pct }: { earned: number; max: number; pct: number | null }) => (
  <span className="flex shrink-0 items-baseline gap-2 tabular-nums font-display">
    <span className="t-meta text-text-muted">{earned}/{max}</span>
    <span className={cn('t-card font-bold', pct === null ? 'text-text-light' : complianceToneClass(pct))}>
      {pct === null ? '-' : `${pct}%`}
    </span>
  </span>
);

/**
 * What the audit scored, floor by floor and section by section.
 *
 * Only shown on a run that is judged on points. A rule-scored checklist has no maximum to
 * measure against, so there is no percentage of this kind to show.
 */
export const AuditScorePanel = memo(function AuditScorePanel({ items, className }: AuditScorePanelProps) {
  const { data: people = [] } = useAssignableUsersQuery();
  const nameById = useMemo(
    () => new Map(people.map((p) => [p.id, `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`])),
    [people],
  );
  const floors = useMemo(() => floorPoints(items), [items]);
  const total = useMemo(() => totalPoints(items), [items]);

  if (total.max === 0) return null;

  return (
    <section aria-label="Audit score" className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3.5 sm:p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white" aria-hidden="true">
            <Building2 size={15} strokeWidth={2.5} />
          </span>
          <span className="t-card font-display font-bold text-text">Audit score</span>
        </span>
        <span className="flex items-baseline gap-2 tabular-nums font-display">
          <span className="t-meta font-medium text-text-muted">{total.earned} of {total.max} points</span>
          <span className={cn('t-section font-bold', total.pct === null ? 'text-text-light' : complianceToneClass(total.pct))}>
            {total.pct === null ? '-' : `${total.pct}%`}
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {floors.map((floor) => (
          <li key={floor.floor ?? 'none'} className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-surface-hover/25 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-1.5 t-meta font-display font-bold text-text">
                <Layers size={13} className="shrink-0 text-text-muted" aria-hidden />
                <span className="min-w-0 truncate">{floor.floor ?? 'No floor'}</span>
              </span>
              <Figure earned={floor.earned} max={floor.max} pct={floor.pct} />
            </div>

            <ul className="flex flex-col divide-y divide-border/40">
              {floor.sections.map((section) => (
                <li key={section.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">
                      {section.section ?? 'No section'}
                    </span>
                    {section.sectionOwnerId && (
                      <span className="flex min-w-0 items-center gap-1 t-meta font-display text-text-muted">
                        <User size={11} className="shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">{nameById.get(section.sectionOwnerId) ?? 'Unknown'}</span>
                      </span>
                    )}
                    <span className="t-meta tabular-nums text-text-light">{section.answered}/{section.scored} answered</span>
                  </span>
                  <Figure earned={section.earned} max={section.max} pct={section.pct} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
});
