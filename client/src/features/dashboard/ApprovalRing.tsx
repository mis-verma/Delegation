import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { CountUp } from '../../components/countUp';
import { useApprovalSources } from './useApprovalSources';
import { ACTIVITY_CATEGORY_LABEL } from './dashboardDisplay';

type Kind = 'ticket' | 'delegation' | 'checklist';

const KINDS: readonly Kind[] = ['ticket', 'delegation', 'checklist'];
const STROKE: Record<Kind, string> = { ticket: 'stroke-vivid-sky', delegation: 'stroke-vivid-green', checklist: 'stroke-vivid-blue' };
const DOT: Record<Kind, string> = { ticket: 'bg-vivid-sky', delegation: 'bg-vivid-green', checklist: 'bg-vivid-blue' };

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 4;

export const ApprovalRing = memo(() => {
  const { tickets, tasks, checklists, isPending, total } = useApprovalSources();

  const counts = useMemo<Record<Kind, number>>(
    () => ({ ticket: tickets.data?.total ?? 0, delegation: tasks.data?.total ?? 0, checklist: checklists.data?.total ?? 0 }),
    [tickets.data, tasks.data, checklists.data],
  );

  const segments = useMemo(() => {
    const active = KINDS.filter((k) => counts[k] > 0);
    const sum = active.reduce((n, k) => n + counts[k], 0);
    const room = active.length > 1 ? CIRCUMFERENCE - GAP * active.length : CIRCUMFERENCE;
    let offset = 0;
    return active.map((k) => {
      const length = (counts[k] / sum) * room;
      const seg = { kind: k, length, offset };
      offset += length + (active.length > 1 ? GAP : 0);
      return seg;
    });
  }, [counts]);

  return (
    <div className="flex items-center gap-4 pb-3">
      <div className="relative size-24 shrink-0" role="img" aria-label={`${total} waiting for approval`}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" className="stroke-border/60" />
          {segments.map((s) => (
            <circle
              key={s.kind}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              className={cn(STROKE[s.kind], 'motion-safe:transition-[stroke-dasharray,stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out')}
              strokeDasharray={`${Math.max(0.5, s.length - 0.5)} ${CIRCUMFERENCE}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isPending ? (
            <Skeleton className="h-6 w-8" />
          ) : (
            <span className="t-stat font-display font-extrabold tabular-nums leading-none text-text">
              <CountUp value={total} fromZero />
            </span>
          )}
          <span className="t-meta font-medium text-text-muted">waiting</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {KINDS.map((k) => (
          <li key={k} className="flex items-center gap-2 t-meta font-medium text-text-secondary">
            <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', DOT[k])} />
            <span className="min-w-0 flex-1 truncate">{ACTIVITY_CATEGORY_LABEL[k]}s</span>
            <span className="font-display font-bold tabular-nums text-text">{isPending ? '–' : counts[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
ApprovalRing.displayName = 'ApprovalRing';
