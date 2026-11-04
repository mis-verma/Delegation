import { memo, useMemo } from 'react';
import { FAIR_FROM } from '../../lib/scoreBands';
import { FigurePanel, type FigureCell } from './FigurePanel';
import { DAY_MS, type ChecklistRow } from './verificationModel';

interface QueueOverviewProps {
  loading: boolean;
  rows: ChecklistRow[];
  now: number;
  partial: boolean;
  attentionActive: boolean;
  slowActive: boolean;
  onToggleAttention: () => void;
  onToggleSlow: () => void;
  onShowReady: () => void;
  onSortLowest: () => void;
  sortedLowest: boolean;
  failed: boolean;
  onRetry: () => void;
}

const pct = (n: number) => `${Math.round(n)}%`;

export const QueueOverview = memo(function QueueOverview({
  loading, rows, now, partial, attentionActive, slowActive, onToggleAttention, onToggleSlow, onShowReady, onSortLowest, sortedLowest, failed, onRetry,
}: QueueOverviewProps) {
  const stats = useMemo(() => {
    let needsLook = 0;
    let critical = 0;
    let clean = 0;
    let slow = 0;
    let sum = 0;
    let counted = 0;
    for (const r of rows) {
      if (r.risk.needsAttention) needsLook += 1;
      if (r.risk.criticalFailed > 0) critical += 1;
      if (r.risk.clean) clean += 1;
      if (now - r.waitingSince >= 3 * DAY_MS) slow += 1;
      if (r.risk.compliance !== null) { sum += r.risk.compliance; counted += 1; }
    }
    return { needsLook, critical, clean, slow, average: counted ? Math.round(sum / counted) : null };
  }, [rows, now]);

  const total = rows.length;
  const avg = stats.average;
  const cells: FigureCell[] = [
    {
      key: 'look',
      label: 'Need a look',
      short: 'Look',
      value: stats.needsLook,
      note: stats.critical > 0 ? `${stats.critical} critical` : stats.needsLook > 0 ? 'Wrong answers' : 'All clear',
      alert: stats.critical > 0,
      help: stats.critical > 0 ? `${stats.critical} with a critical question failed. Tap to show only the ones that need a look.` : 'Checklists with wrong answers or photo problems. Tap to show only these.',
      selected: attentionActive,
      onClick: onToggleAttention,
    },
    {
      key: 'ready',
      label: 'Ready to approve',
      short: 'Ready',
      value: stats.clean,
      note: stats.clean > 0 ? 'Tap to show' : 'None yet',
      help: 'Fully compliant, photos in, never sent back. Approve them in one go below.',
      onClick: stats.clean > 0 ? onShowReady : undefined,
    },
    {
      key: 'slow',
      label: 'Waiting 3+ days',
      short: '3+ days',
      value: stats.slow,
      note: stats.slow > 0 ? 'Review first' : 'None late',
      alert: stats.slow > 0,
      help: 'Checklists that have waited three days or more. Tap to show only these.',
      selected: slowActive,
      onClick: onToggleSlow,
    },
    {
      key: 'avg',
      label: 'Avg compliance',
      short: 'Avg',
      value: avg === null ? null : pct(avg),
      note: avg === null ? undefined : sortedLowest ? 'Lowest first' : 'Tap to sort',
      alert: avg !== null && avg < FAIR_FROM,
      help: `Average compliance across the ${total} ${total === 1 ? 'checklist' : 'checklists'} waiting. Tap to put the lowest first.`,
      selected: sortedLowest,
      onClick: avg === null ? undefined : onSortLowest,
    },
  ];

  return (
    <section aria-label="Checklist checks" className="flex flex-col gap-2">
      <h2 className="t-meta font-display font-semibold text-text-secondary">Checklist checks</h2>
      <FigurePanel cells={cells} label="Checklist checks" loading={loading} failed={failed} onRetry={onRetry} phoneDense />
      {partial && <p className="max-sm:hidden t-meta text-text-muted">The counts cover the checklists loaded so far. Load more below to include the rest.</p>}
    </section>
  );
});
