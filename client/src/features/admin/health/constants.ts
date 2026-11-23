/*
 * Tailwind CSS style lookup maps for System Health UI.
 * These provide O(1) constant‑time resolution of colors, icons and labels
 * for health levels and background job statuses.
 */

import type { HealthLevel, HealthJobStatus } from '../../../api/systemHealth';
import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';

/**
 * Mapping of overall health level to a Tailwind background tone, icon and fallback label.
 */
export const HEALTH_LEVEL_MAP: Record<HealthLevel, { tone: string; icon: typeof CheckCircle2 | typeof TriangleAlert | typeof XCircle; label: string }> = {
  ok: { tone: 'bg-success', icon: CheckCircle2, label: 'Healthy' },
  warn: { tone: 'bg-warning', icon: TriangleAlert, label: 'Needs a look' },
  down: { tone: 'bg-danger', icon: XCircle, label: 'Down' },
};

/**
 * Mapping of background job status to a health level (or idle) and a human readable label.
 */
export const JOB_STATUS_MAP: Record<HealthJobStatus, { level: HealthLevel | 'idle'; label: string }> = {
  ok: { level: 'ok', label: 'Running' },
  late: { level: 'warn', label: 'Late' },
  failing: { level: 'down', label: 'Failing' },
  waiting: { level: 'idle', label: 'Not run yet' },
};
