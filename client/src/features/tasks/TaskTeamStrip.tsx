import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useOrgToday } from '../checklist/useOrgToday';
import { windowFor } from '../dashboard/scorePeriods';
import { capWindowAtToday } from '../scores/useScoreWindow';
import { useScoreExplorer } from '../scores/useScoreExplorer';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { formatPct } from '../../lib/percent';

interface TaskTeamStripProps {
  pickedId: string | null;
  onPick: (id: string | null) => void;
}

export const TaskTeamStrip = ({ pickedId, onPick }: TaskTeamStripProps) => {
  const { user } = useAuth();
  const isHead = user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const today = useOrgToday();
  const window = windowFor('month', 0, today);
  const capped = capWindowAtToday(window.from, window.to, today);
  const query = useScoreExplorer(isHead ? { from: capped.from, to: capped.to, view: 'person' } : null, isHead);

  const people = useMemo(
    () =>
      (query.data?.rows ?? [])
        .filter((row) => row.kind === 'person' && row.delegation.due + row.delegation.done + row.delegation.open + row.delegation.overdue > 0)
        .sort((a, b) => b.delegation.overdue - a.delegation.overdue || b.delegation.open - a.delegation.open || a.name.localeCompare(b.name)),
    [query.data],
  );

  if (!isHead || people.length === 0) return null;

  return (
    <section aria-label="My team" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 t-card font-display font-bold text-text">
        <Users className="size-4 text-text-light" aria-hidden="true" />
        My team, {window.label}
      </h2>
      <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {people.map((person) => {
          const block = person.delegation;
          const picked = pickedId === person.id;
          return (
            <li key={person.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => onPick(picked ? null : person.id)}
                className={cn(
                  'flex min-h-14 min-w-44 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] [-webkit-tap-highlight-color:transparent]',
                  picked ? 'border-primary-500/60 bg-primary-500/10' : 'border-border/60 bg-surface hover:border-border-hover',
                )}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-meta font-bold text-white', avatarColorClass(person.name))} aria-hidden="true">
                  {getInitials(person.name)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate t-card font-display font-semibold text-text">{person.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 t-meta font-medium text-text-muted">
                    <span className="tabular-nums">{block.open} open</span>
                    {block.overdue > 0 && <span className="tabular-nums font-semibold text-danger">{block.overdue} late</span>}
                    <span className="tabular-nums">{block.done} of {block.due} done{block.completion !== null ? `, ${formatPct(block.completion)}` : ''}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
