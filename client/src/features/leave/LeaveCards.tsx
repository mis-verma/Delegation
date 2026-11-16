import { memo } from 'react';
import { CalendarCheck2, MessageSquareText, TriangleAlert } from 'lucide-react';
import { Avatar, ENTITY_CARD_CLASS, IconChip } from '../../components';
import { cn } from '@/lib/utils';
import type { LeaveEntry } from '../../api/leave';
import { DAY, addDays, asUtc, leaveDays, leaveRange, phaseOf, stillOpenText, type LeaveActions, type LeaveViewProps } from './leaveDisplay';
import { LeaveActionButtons } from './LeaveActionButtons';
import { LeaveSection } from './LeaveSection';
import { LeaveStatusChip } from './LeaveStatusChip';
import { RequestCard } from './LeaveRequests';

const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const FAINT = 'bg-surface-hover/80';
const LIST_GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3';

interface LeaveCardProps {
  entry: LeaveEntry;
  today: string;
  busy: boolean;
  actions: LeaveActions;
}

const LeaveCard = ({ entry, today, busy, actions }: LeaveCardProps) => {
  const phase = phaseOf(entry, today);
  const start = asUtc(entry.startDate);
  const work = stillOpenText(entry, today);
  const past = phase === 'recent';
  const name = entry.mine ? `${entry.userName} (you)` : entry.userName;
  return (
    <li aria-busy={busy || undefined} className={cn(ENTITY_CARD_CLASS, 'flex-row items-start justify-start gap-3 p-3 transition-[border-color,opacity] duration-150 ease-out sm:p-4', past && 'bg-surface-hover/30', busy && 'pointer-events-none opacity-60')}>
      <div
        aria-hidden
        className={cn(
          'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border leading-none',
          phase === 'now' ? 'border-vivid-blue/40 bg-vivid-blue/10' : 'border-border/60 bg-surface-hover',
        )}
      >
        <span className={cn('t-meta font-display font-semibold', phase === 'now' ? 'text-vivid-blue-text' : 'text-text-muted')}>{MONTH_SHORT.format(start)}</span>
        <span className={cn('pt-0.5 t-stat font-figure font-bold tabular-nums', past ? 'text-text-muted' : 'text-text')}>{start.getUTCDate()}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={entry.userName} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn('line-clamp-1 t-card font-display font-bold', past ? 'text-text-secondary' : 'text-text')}>{name}</span>
            <span className="line-clamp-1 t-meta font-display text-text-muted">{entry.departmentName ?? 'No department'}</span>
          </div>
          <LeaveActionButtons entry={entry} actions={actions} />
        </div>

        <p className="t-meta font-display font-semibold tabular-nums text-text-secondary">
          {leaveRange(entry)}
          <span className="font-medium text-text-muted">, {leaveDays(entry)}</span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <LeaveStatusChip entry={entry} today={today} />
          {!past && <IconChip icon={CalendarCheck2} tone={FAINT} label={`Back ${DAY.format(asUtc(addDays(entry.endDate, 1)))}`} labelClassName="tabular-nums" />}
          {entry.reason && <IconChip icon={MessageSquareText} tone={FAINT} label={entry.reason} title={entry.reason} labelClassName="truncate" />}
        </div>

        {work && (
          <p className="flex items-start gap-1.5 rounded-lg bg-vivid-red/10 px-2.5 py-1.5 t-meta font-display font-semibold text-vivid-red-text">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Still open for {entry.mine ? 'you' : 'them'}: {work}. Hand over what cannot wait.
          </p>
        )}
      </div>
    </li>
  );
};

export const LeaveCards = memo(({ groups, today, isBusy, actionsFor }: LeaveViewProps) => (
  <>
    {groups.map((group) => (
      <LeaveSection key={group.key} group={group.key} count={group.entries.length}>
        <ul className={LIST_GRID}>
          {group.entries.map((entry) => {
            const Card = entry.status === 'APPROVED' ? LeaveCard : RequestCard;
            return <Card key={entry.id} entry={entry} today={today} busy={isBusy(entry.id)} actions={actionsFor(entry)} />;
          })}
        </ul>
      </LeaveSection>
    ))}
  </>
));
LeaveCards.displayName = 'LeaveCards';
