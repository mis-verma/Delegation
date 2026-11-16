import { AlertTriangle, CalendarClock, Clock3, Layers, type LucideIcon } from 'lucide-react';
import type { WorkKind, WorkMetric } from '../../../api/dashboard';
import type { BoardTone } from '../boardTypes';
import { buildModuleRoute } from './statTargets';
import type { ModuleKey } from './statsRegistry';

interface MetricLook {
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

interface CountsLike {
  pending: number;
  overdue: number;
  due: number;
  total: number;
}

export const metricValue = (counts: CountsLike | undefined, metric: WorkMetric) =>
  !counts ? 0 : metric === 'pending' ? counts.pending : metric === 'delayed' ? counts.overdue : metric === 'due' ? counts.due : counts.total;

const MODULE_OF: Record<WorkKind, ModuleKey> = { delegation: 'delegation', ticket: 'tickets', checklist: 'checklist', todo: 'todo' };

export const moduleListHref = (kind: WorkKind, metric: WorkMetric, team: boolean, userId?: string): string =>
  buildModuleRoute(MODULE_OF[kind], metric, undefined, { scope: team ? 'visible' : 'mine', team, userId });
