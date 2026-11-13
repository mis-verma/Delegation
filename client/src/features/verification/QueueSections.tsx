import { memo } from 'react';
import { SECTION_LOOK, type QueueSection } from './sectionLook';
import type { QueueTab } from './verificationModel';
import type { SectionStats } from './sectionStats';
import { FigurePanel, type FigureCell } from './FigurePanel';

interface QueueSectionsProps {
  tab: QueueTab;
  loading: boolean;
  stats: Record<QueueSection, SectionStats>;
  total: number;
  failed: Record<QueueSection, boolean>;
  onRetry: () => void;
  onChange: (tab: QueueTab) => void;
}

const SECTIONS: QueueSection[] = ['checklists', 'tickets', 'delegations'];

const noteFor = (count: number, late: number) => (count === 0 ? 'Nothing waiting' : late > 0 ? `${late} over 24h` : 'All on time');

export const QueueSections = memo(function QueueSections({ tab, loading, stats, total, failed, onRetry, onChange }: QueueSectionsProps) {
  const everythingLate = SECTIONS.reduce((n, s) => n + stats[s].late, 0);
  const anyFailed = SECTIONS.some((s) => failed[s]);

  const cells: FigureCell[] = [
    {
      key: 'all',
      label: 'Everything',
      short: 'All',
      value: total,
      note: anyFailed ? 'Some did not load' : noteFor(total, everythingLate),
      alert: everythingLate > 0 || anyFailed,
      help: 'Everything waiting for your review. Late means waiting more than 24 hours.',
      selected: tab === 'all',
      onClick: () => onChange('all'),
    },
    ...SECTIONS.map((section): FigureCell => {
      const s = stats[section];
      return {
        key: section,
        label: SECTION_LOOK[section].label,
        value: s.count,
        note: noteFor(s.count, s.late),
        alert: s.late > 0,
        help: `${SECTION_LOOK[section].label} waiting for review. Tap to show only these, tap again to show everything.`,
        selected: tab === section,
        failed: failed[section],
        onClick: () => onChange(tab === section ? 'all' : section),
      };
    }),
  ];

  return (
    <nav aria-label="Review sections">
      <FigurePanel cells={cells} label="Review sections" loading={loading} onRetry={onRetry} phoneDense />
    </nav>
  );
});
