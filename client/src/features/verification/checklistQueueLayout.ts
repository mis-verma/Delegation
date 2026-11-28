import { useEffect, useState } from 'react';
import { CheckCircle2, Flag, LayoutGrid, List, ShieldAlert, Table2, type LucideIcon } from 'lucide-react';
import type { QueueGroup } from './verificationModel';

export type ChecklistQueueLayout = 'cards' | 'list' | 'table';

const STORAGE_KEY = 'verification.checklistQueueLayout';

const isLayout = (v: string | null): v is ChecklistQueueLayout => v === 'cards' || v === 'list' || v === 'table';

// Remembered per browser only (not synced), same tier as a column-width or filter preference —
// nothing worth losing if it comes back empty.
export const useChecklistQueueLayout = (): [ChecklistQueueLayout, (next: ChecklistQueueLayout) => void] => {
  const [layout, setLayout] = useState<ChecklistQueueLayout>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return isLayout(stored) ? stored : 'cards';
    } catch {
      return 'cards';
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, layout); } catch { /* best effort */ }
  }, [layout]);

  return [layout, setLayout];
};

// One grid for every list in the queue (checklists, tickets, delegations): cards run 1 -> 2 -> 3 columns,
// the compact list runs 1 -> 2. `table` is checklists-only; everything else treats it as the list.
export type RowLayout = 'cards' | 'list';
export const rowLayoutOf = (layout: ChecklistQueueLayout): RowLayout => (layout === 'cards' ? 'cards' : 'list');
export const ROW_GRID: Record<RowLayout, string> = {
  cards: 'grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3',
  list: 'grid grid-cols-1 gap-2 md:grid-cols-2',
};

export const LAYOUT_OPTIONS: { value: ChecklistQueueLayout; label: string; icon: LucideIcon }[] = [
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'list', label: 'List', icon: List },
  { value: 'table', label: 'Table', icon: Table2 },
];

export interface GroupLook {
  label: string;
  icon: LucideIcon;
  text: string;
  accentBar: string;
  tint: string;
}

// The same read for "is this one done or not" everywhere it shows up: a card's badge, a list
// row's dot, a table row's status cell and its left accent bar.
export const GROUP_LOOK: Record<QueueGroup, GroupLook> = {
  critical: { label: 'Critical', icon: Flag, text: 'text-danger', accentBar: 'bg-danger', tint: 'bg-danger/[0.07] dark:bg-danger/[0.12]' },
  attention: { label: 'Needs a look', icon: ShieldAlert, text: 'text-warning', accentBar: 'bg-warning', tint: 'bg-warning/[0.06] dark:bg-warning/10' },
  ready: { label: 'Complete, no issues', icon: CheckCircle2, text: 'text-success', accentBar: 'bg-success', tint: '' },
};
