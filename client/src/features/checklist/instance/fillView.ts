import { LayoutGrid, Table2 } from 'lucide-react';
import type { SlidingTabOption } from '../../../components';

export type FillView = 'cards' | 'table';
export const FILL_VIEWS: readonly FillView[] = ['cards', 'table'];
export const FILL_VIEW_OPTIONS: SlidingTabOption<FillView>[] = [
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: Table2 },
];

export const sortByScore = <T,>(rows: T[], pctOf: (row: T) => number | null | undefined, nameOf: (row: T) => string, sort: FillSort): T[] => {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const dir = sort === 'low' ? 1 : -1;
  return copy.sort((a, b) => {
    const pa = pctOf(a), pb = pctOf(b);
    if (pa == null && pb == null) return nameOf(a).localeCompare(nameOf(b));
    if (pa == null) return 1;
    if (pb == null) return -1;
    return (pa - pb) * dir || nameOf(a).localeCompare(nameOf(b));
  });
};

export type FillSort = 'low' | 'high' | 'name';
export const FILL_SORTS: readonly FillSort[] = ['low', 'high', 'name'];
export const FILL_SORT_OPTIONS: SlidingTabOption<FillSort>[] = [
  { value: 'low', label: 'Lowest first', shortLabel: 'Lowest' },
  { value: 'high', label: 'Highest first', shortLabel: 'Highest' },
  { value: 'name', label: 'A to Z' },
];
