import { Layers, Clock, CalendarClock, CheckCircle2, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { QuickFilterTile } from './QuickFilterStats';

export const TONE = {
  neutral: { bgTint: 'bg-vivid-blue/12', accentBar: 'bg-vivid-blue', accentBorder: 'border-vivid-blue/70', ring: 'border-vivid-blue/40', iconTint: 'text-vivid-blue-text' },
  todo: { bgTint: 'bg-vivid-sky/12', accentBar: 'bg-vivid-sky', accentBorder: 'border-vivid-sky/70', ring: 'border-vivid-sky/40', iconTint: 'text-vivid-sky-text' },
  warning: { bgTint: 'bg-vivid-blue/12', accentBar: 'bg-vivid-blue', accentBorder: 'border-vivid-blue/70', ring: 'border-vivid-blue/40', iconTint: 'text-vivid-blue-text' },
  success: { bgTint: 'bg-vivid-green/12', accentBar: 'bg-vivid-green', accentBorder: 'border-vivid-green/70', ring: 'border-vivid-green/40', iconTint: 'text-vivid-green-text' },
  danger: { bgTint: 'bg-vivid-red/12', accentBar: 'bg-vivid-red', accentBorder: 'border-vivid-red/70', ring: 'border-vivid-red/40', iconTint: 'text-vivid-red-text' },
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
