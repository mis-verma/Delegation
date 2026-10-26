import { useMemo } from 'react';
import { UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOrgToday } from '../checklist/useOrgToday';
import { useScoreExplorer } from '../scores/useScoreExplorer';
import { formatPct } from '../../lib/percent';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';

const WINDOW_DAYS = 30;
const MAX_PEOPLE = 3;

const dayKey = (today: string, back: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};

export const PersonContext = ({ items }: { items: ChecklistInstanceItem[] }) => {
  const { user } = useAuth();
  const canSee = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const today = useOrgToday();
  const ids = useMemo(() => [...new Set(items.map((i) => i.completedBy).filter((id): id is string => !!id))].slice(0, MAX_PEOPLE), [items]);
  const query = useScoreExplorer(canSee && ids.length > 0 ? { from: dayKey(today, WINDOW_DAYS - 1), to: today, view: 'person' } : null, canSee && ids.length > 0);

  const rows = useMemo(() => (query.data?.rows ?? []).filter((r) => r.kind === 'person' && ids.includes(r.id)), [query.data, ids]);
  if (!canSee || rows.length === 0) return null;

  return (
    <section aria-label="Who filled this in" className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-surface-hover/30 p-3">
      <h3 className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
        <UserRound className="size-3.5" aria-hidden="true" />
        Who filled this in, last {WINDOW_DAYS} days
      </h3>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 t-meta font-display">
            <span className="font-semibold text-text">{row.name}</span>
            <span className="tabular-nums text-text-muted">Completion {row.checklist.completion === null ? 'no data' : formatPct(row.checklist.completion)}</span>
            <span className="tabular-nums text-text-muted">Answers right {row.checklist.compliance === null ? 'no data' : formatPct(row.checklist.compliance)}</span>
            <span className="tabular-nums text-text-muted">{row.checklist.done} of {row.checklist.due} runs done</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
