import { Layers, Clock, CalendarClock, CheckCircle2, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { QuickFilterTile } from './QuickFilterStats';

export const TONE = {
  neutral: { bgTint: 'bg-primary-500/15', accentBar: 'bg-primary-600', accentBorder: 'border-primary-500/40', ring: 'border-primary-500/30', iconTint: 'text-primary-600 dark:text-primary-400' },
  todo: { bgTint: 'bg-status-todo/15', accentBar: 'bg-status-todo', accentBorder: 'border-status-todo/40', ring: 'border-status-todo/30', iconTint: 'text-status-todo' },
  warning: { bgTint: 'bg-warning/15', accentBar: 'bg-warning', accentBorder: 'border-warning/40', ring: 'border-warning/30', iconTint: 'text-warning' },
  success: { bgTint: 'bg-success/15', accentBar: 'bg-success', accentBorder: 'border-success/40', ring: 'border-success/30', iconTint: 'text-success' },
  danger: { bgTint: 'bg-danger/15', accentBar: 'bg-danger', accentBorder: 'border-danger/40', ring: 'border-danger/30', iconTint: 'text-danger' },
} as const;

export type StatusTileKey = 'all' | 'pending' | 'due' | 'completed' | 'delayed' | 'overdue';

const STATUS_TILE: Record<StatusTileKey, { label: string; shortLabel?: string; tone: keyof typeof TONE; icon: LucideIcon }> = {
  all: { label: 'All', tone: 'neutral', icon: Layers },
  pending: { label: 'Pending', tone: 'todo', icon: Clock },
  due: { label: 'Due', tone: 'warning', icon: CalendarClock },
  completed: { label: 'Completed', shortLabel: 'Done', tone: 'success', icon: CheckCircle2 },
  delayed: { label: 'Delayed', tone: 'danger', icon: AlertTriangle },
  overdue: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
};

export const statusTiles = <K extends StatusTileKey>(
  keys: readonly K[],
  labels?: Partial<Record<K, string>>,
): QuickFilterTile<K>[] =>
  keys.map((key) => {
    const { label, shortLabel, tone, icon } = STATUS_TILE[key];
    return { key, label: labels?.[key] ?? label, shortLabel: labels?.[key] ? undefined : shortLabel, icon, ...TONE[tone] };
  });
