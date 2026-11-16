import { memo } from 'react';
import { Avatar } from '../../components';
import { cn } from '@/lib/utils';
import { leaveDays, leaveRange, stillOpenText, type LeaveViewProps } from './leaveDisplay';
import { LeaveActionButtons } from './LeaveActionButtons';
import { LeaveSection } from './LeaveSection';
import { LeaveStatusChip } from './LeaveStatusChip';

export const LeaveRows = memo(({ groups, today, isBusy, actionsFor }: LeaveViewProps) => (
  <>
    {groups.map((group) => (
      <LeaveSection key={group.key} group={group.key} count={group.entries.length}>
        <ul className="flex flex-col gap-2">
          {group.entries.map((entry) => {
            const work = stillOpenText(entry, today);
            const busy = isBusy(entry.id);
            return (
              <li
                key={entry.id}
                aria-busy={busy || undefined}
                className={cn('flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-2.5 transition-[border-color,opacity] duration-150 ease-out hover:border-border-hover sm:px-3', busy && 'pointer-events-none opacity-60')}
              >
                <Avatar name={entry.userName} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-1 t-card font-display font-bold text-text">{entry.mine ? `${entry.userName} (you)` : entry.userName}</span>
                  <span className="line-clamp-2 t-meta font-display tabular-nums text-text-muted">
                    {leaveRange(entry)}, {leaveDays(entry)}
                    <span className="hidden sm:inline">{` · ${entry.departmentName ?? 'No department'}`}</span>
                  </span>
                  {work && <span className="line-clamp-1 t-meta font-display font-semibold text-vivid-red-text">Still open: {work}</span>}
                </div>
                <LeaveStatusChip entry={entry} today={today} iconOnlyOnMobile />
                <LeaveActionButtons entry={entry} actions={actionsFor(entry)} />
              </li>
            );
          })}
        </ul>
      </LeaveSection>
    ))}
  </>
));
LeaveRows.displayName = 'LeaveRows';
