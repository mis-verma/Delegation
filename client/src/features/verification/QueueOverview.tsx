import { memo, useMemo } from 'react';
import { Skeleton } from '../../components';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';
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
}

const rateTone = (rate: number): FigureTone => (rate >= GOOD_FROM ? 'good' : rate >= FAIR_FROM ? 'fair' : 'bad');
const shareOf = (part: number, whole: number) => (whole <= 0 ? 100 : Math.max(0, ((whole - part) / whole) * 100));
const pct = (n: number) => `${Math.round(n)}%`;

export const QueueOverview = memo(function QueueOverview({
  loading, rows, now, partial, attentionActive, slowActive, onToggleAttention, onToggleSlow,
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

  if (loading) {
    return (
      <div className="grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4" role="status" aria-label="Loading overview">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[4.75rem] rounded-lg" />)}
      </div>
    );
  }

  const total = rows.length;
  const avg = stats.average;
  return (
    <section aria-label="Checklist checks" className="flex flex-col gap-2">
      <h2 className="t-meta font-display font-semibold text-text-secondary">Checklist checks</h2>
      <div className="@container grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
        <FigureCard
          label="Need a look"
          help={stats.critical > 0 ? `${stats.critical} with a critical question failed. Tap to show only the ones that need a look.` : 'Checklists with wrong answers or photo problems. Tap to show only these.'}
          value={stats.needsLook}
          tone={stats.critical > 0 ? 'bad' : stats.needsLook > 0 ? 'fair' : 'good'}
          bar={shareOf(stats.needsLook, total)}
          loading={false}
          selected={attentionActive}
          onClick={onToggleAttention}
        />
        <FigureCard
          label="Ready to approve"
          short="Ready"
          help="Fully compliant, photos in, never sent back. Approve them in one go below."
          value={stats.clean}
          tone={stats.clean > 0 ? 'good' : 'plain'}
          bar={total === 0 ? null : (stats.clean / total) * 100}
          loading={false}
        />
        <FigureCard
          label="Waiting 3+ days"
          short="3+ days"
          help="Checklists that have waited three days or more. Tap to show only these."
          value={stats.slow}
          tone={stats.slow > 0 ? 'bad' : 'good'}
          bar={shareOf(stats.slow, total)}
          loading={false}
          selected={slowActive}
          onClick={onToggleSlow}
        />
        <FigureCard
          label="Avg compliance"
          short="Compliance"
          help={`Average compliance across the ${total} ${total === 1 ? 'checklist' : 'checklists'} waiting.`}
          value={avg}
          format={pct}
          tone={avg === null ? 'plain' : rateTone(avg)}
          bar={avg}
          loading={false}
        />
      </div>
      {partial && <p className="t-meta text-text-muted">The counts cover the checklists loaded so far. Load more below to include the rest.</p>}
    </section>
  );
});
