import { memo } from 'react';
import { Skeleton } from '../../components';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';
import { SECTION_LOOK, type QueueSection } from './sectionLook';
import type { QueueTab } from './verificationModel';
import type { SectionStats } from './sectionStats';

interface QueueSectionsProps {
  tab: QueueTab;
  loading: boolean;
  stats: Record<QueueSection, SectionStats>;
  total: number;
  onChange: (tab: QueueTab) => void;
}

const SECTIONS: QueueSection[] = ['checklists', 'tickets', 'delegations'];

const shareWithin = (count: number, late: number) => (count <= 0 ? 100 : Math.max(0, ((count - late) / count) * 100));
const toneOf = (count: number, late: number): FigureTone => {
  if (count === 0 || late === 0) return 'good';
  const share = shareWithin(count, late);
  return share >= GOOD_FROM ? 'good' : share >= FAIR_FROM ? 'fair' : 'bad';
};

export const QueueSections = memo(function QueueSections({ tab, loading, stats, total, onChange }: QueueSectionsProps) {
  if (loading) {
    return (
      <div className="grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4" role="status" aria-label="Loading sections">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[4.75rem] rounded-lg" />)}
      </div>
    );
  }
  const everythingLate = SECTIONS.reduce((n, s) => n + stats[s].late, 0);
  return (
    <nav aria-label="Review sections" className="@container grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
      <FigureCard
        label="Everything"
        help="Everything waiting for review. The bar shows how much is still inside 24 hours."
        value={total}
        tone={toneOf(total, everythingLate)}
        bar={shareWithin(total, everythingLate)}
        loading={false}
        selected={tab === 'all'}
        compact
        onClick={() => onChange('all')}
      />
      {SECTIONS.map((section) => {
        const s = stats[section];
        return (
          <FigureCard
            key={section}
            label={SECTION_LOOK[section].label}
            help={`${SECTION_LOOK[section].label} waiting for review. The bar shows how many are still inside 24 hours. Tap again to see everything.`}
            value={s.count}
            tone={toneOf(s.count, s.late)}
            bar={shareWithin(s.count, s.late)}
            loading={false}
            selected={tab === section}
            compact
            onClick={() => onChange(tab === section ? 'all' : section)}
          />
        );
      })}
    </nav>
  );
});
