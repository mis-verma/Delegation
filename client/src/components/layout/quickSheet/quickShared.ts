export const QUICK_MAX = 8;

export interface PanelProps {
  now: number;
  onClose: () => void;
}

export const byDueThenNewest = <T extends { due: number | null; created: number }>(a: T, b: T): number => {
  if (a.due !== null && b.due !== null) return a.due - b.due;
  if (a.due !== null) return -1;
  if (b.due !== null) return 1;
  return b.created - a.created;
};
