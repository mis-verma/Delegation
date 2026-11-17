import { memo, useMemo } from 'react';
import { Hand, Timer, UserCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSharedNow } from '../../../lib/useSharedNow';
import type { Ticket } from '../../../api/ticket';
import { formatTatSpan, ticketTatStages, type TatStageKey } from './tatStages';

const ICON: Record<TatStageKey, LucideIcon> = { hod: Hand, user: UserCheck, total: Timer };
const TILE: Record<TatStageKey, string> = { hod: 'bg-vivid-blue', user: 'bg-vivid-green', total: 'bg-primary-600 dark:bg-primary-400' };

export const TicketTatStages = memo(({ ticket }: { ticket: Ticket }) => {
  const now = useSharedNow();
  const stages = useMemo(() => ticketTatStages(ticket, now), [ticket, now]);
  if (stages.length < 2) return null;

  return (
    <section aria-label="Time taken at each step" className="flex flex-col gap-2">
      <h2 className="t-card font-display font-bold text-text">Time taken</h2>
      <ol className={cn('grid gap-2', stages.length === 3 ? 'grid-cols-2 sm:grid-cols-3 [&>:last-child]:max-sm:col-span-2' : 'grid-cols-2')}>
        {stages.map((stage) => {
          const Icon = ICON[stage.key];
          const total = stage.key === 'total';
          return (
            <li
              key={stage.key}
              title={stage.hint}
              className={cn(
                'flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-2.5',
                stage.late ? 'border-danger/40 bg-danger/5' : total ? 'border-primary-500/30 bg-primary-500/5' : 'border-border/60 bg-surface',
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', stage.late ? 'bg-danger' : TILE[stage.key])} aria-hidden="true">
                  <Icon className="size-3" strokeWidth={2.5} />
                </span>
                <span className="truncate t-meta font-display font-semibold text-text-secondary">{stage.label}</span>
                {stage.late && <span className="shrink-0 rounded-full bg-danger/10 px-1.5 t-meta font-display font-bold text-danger">Late</span>}
              </span>
              <span className="flex items-center gap-1.5">
                {stage.running && <span className="live-dot size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />}
                <span className="t-card font-figure font-bold tabular-nums text-text">{formatTatSpan(stage.ms)}</span>
              </span>
              <span className="line-clamp-1 t-meta text-text-muted">
                {stage.by ? `${stage.note} by ${stage.by}` : stage.note}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});
TicketTatStages.displayName = 'TicketTatStages';
