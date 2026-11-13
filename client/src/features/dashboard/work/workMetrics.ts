import { AlertTriangle, CalendarClock, Clock3, Layers, type LucideIcon } from 'lucide-react';
import type { WorkKind, WorkMetric } from '../../../api/dashboard';
import type { BoardTone } from '../StatBoard';

export interface MetricLook {
  key: WorkMetric;
  label: string;
  caption: string;
  icon: LucideIcon;
  tint: BoardTone;
}

export const WORK_METRIC_LOOK: readonly MetricLook[] = [
  { key: 'total', label: 'Total', caption: 'Everything in this view', icon: Layers, tint: 'primary' },
  { key: 'pending', label: 'Pending', caption: 'Still open', icon: Clock3, tint: 'coral' },
  { key: 'delayed', label: 'Delayed', caption: 'Past the deadline', icon: AlertTriangle, tint: 'danger' },
  { key: 'due', label: 'Due', caption: 'Open and still on time', icon: CalendarClock, tint: 'success' },
];

export const isWorkMetric = (value: string | null): value is WorkMetric =>
  value === 'total' || value === 'pending' || value === 'delayed' || value === 'due';

export type WorkScope = 'mine' | 'visible';

export const workListHref = (metric: WorkMetric, scope: WorkScope) => `/work?metric=${metric}&scope=${scope}`;

export interface CountsLike {
  pending: number;
  overdue: number;
  due: number;
  total: number;
}

export const metricValue = (counts: CountsLike | undefined, metric: WorkMetric) =>
  !counts ? 0 : metric === 'pending' ? counts.pending : metric === 'delayed' ? counts.overdue : metric === 'due' ? counts.due : counts.total;

const checklistListHref = (metric: WorkMetric, team: boolean) => {
  const base = team ? '/checklists/team' : '/checklists';
  if (metric === 'pending' || metric === 'due') return `${base}?status=pending`;
  if (metric === 'delayed') return `${base}?status=overdue`;
  return team ? `${base}?status=all` : base;
};

export const moduleListHref = (kind: WorkKind, metric: WorkMetric, team: boolean, userId?: string): string => {
  if (kind === 'checklist') return checklistListHref(metric, team);
  if (kind === 'todo') return '/todo';
  const params = new URLSearchParams({ quickFilter: metric === 'total' ? 'all' : metric });
  if (!team && kind === 'delegation') params.set('mine', '1');
  if (!team && kind === 'ticket' && userId) params.set('assigneeIds', userId);
  return `${kind === 'ticket' ? '/tickets' : '/tasks'}?${params.toString()}`;
};
