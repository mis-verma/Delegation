import { AlertTriangle, Repeat, Trophy } from 'lucide-react';
import type { SlidingTabOption } from '../../components';
import type { HeatmapRow } from '../../api/exceptions';
import { FAIR_FROM } from '../../lib/scoreBands';

export type FillFilter = 'all' | 'behind' | 'streak' | 'perfect';

export const matchesFillFilter = (p: HeatmapRow, filter: FillFilter) => {
  if (filter === 'behind') return p.fillRate != null && p.fillRate < FAIR_FROM;
  if (filter === 'streak') return p.missedStreak >= 2;
  if (filter === 'perfect') return p.due > 0 && p.missed === 0;
  return true;
};

export const fillFilterCounts = (people: HeatmapRow[]): Record<FillFilter, number> => ({
  all: people.length,
  behind: people.filter((p) => matchesFillFilter(p, 'behind')).length,
  streak: people.filter((p) => matchesFillFilter(p, 'streak')).length,
  perfect: people.filter((p) => matchesFillFilter(p, 'perfect')).length,
});

export const fillFilterOptions = (counts: Record<FillFilter, number>): SlidingTabOption<FillFilter>[] => [
  { value: 'all', label: 'Everyone', shortLabel: 'All', badge: counts.all },
  { value: 'behind', label: 'Behind', icon: AlertTriangle, badge: counts.behind, badgeTone: 'danger' },
  { value: 'streak', label: 'Missed in a row', shortLabel: 'In a row', icon: Repeat, badge: counts.streak },
  { value: 'perfect', label: 'Never missed', shortLabel: 'Perfect', icon: Trophy, badge: counts.perfect },
];
