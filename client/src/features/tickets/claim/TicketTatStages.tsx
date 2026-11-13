import { memo, useMemo } from 'react';
import { Hand, Timer, UserCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSharedNow } from '../../../lib/useSharedNow';
import type { Ticket } from '../../../api/ticket';
import { formatTatSpan, ticketTatStages, type TatStageKey } from './tatStages';

const ICON: Record<TatStageKey, LucideIcon> = { head: Hand, member: UserCheck, total: Timer };

export const TicketTatStages = memo(({ ticket }: { ticket: Ticket }) => {
  const now = useSharedNow();
  const stages = useMemo(() => ticketTatStages(ticket, now), [ticket, now]);
  if (stages.length < 2) return null;

  return (
    <section aria-label="Time taken at each step" className="flex flex-col gap-2">
      <h2 className="t-card font-display font-bold text-text">Time taken</h2>
      <ol className={cn('grid gap-2', stages.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {stages.map((stage) => {
          const Icon = ICON[stage.key];
          const total = stage.key === 'total';
          return (
            <li
              key={stage.key}
              title={stage.hint}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center sm:items-start sm:px-3 sm:text-left',
                total ? 'border-primary-500/30 bg-primary-500/5' : 'border-border/60 bg-surface',
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', total ? 'bg-primary-600 dark:bg-primary-400' : 'bg-vivid-blue')} aria-hidden="true">
                  <Icon className="size-3" strokeWidth={2.5} />
                </span>
                <span className="truncate t-meta font-display font-semibold text-text-secondary">{stage.label}</span>
              </span>
              <span className="flex items-center gap-1.5">
                {stage.running && <span className="live-dot size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />}
                <span className="t-card font-figure font-bold tabular-nums text-text">{formatTatSpan(stage.ms)}</span>
              </span>
              <span className="line-clamp-1 t-meta text-text-muted">
                {stage.running ? (stage.key === 'total' ? 'Still open' : 'Waiting') : stage.by ? `By ${stage.by}` : total ? 'Closed' : 'Done'}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});
TicketTatStages.displayName = 'TicketTatStages';
