import { memo } from 'react';
import { Avatar } from '../../components';
import { cn } from '@/lib/utils';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS } from '../../components/dataTable';
import { leaveDays, leaveRange, stillOpenText, type LeaveViewProps } from './leaveDisplay';
import { LeaveActionButtons } from './LeaveActionButtons';
import { LeaveStatusChip } from './LeaveStatusChip';

export const LeaveTable = memo(({ groups, today, isBusy, actionsFor }: LeaveViewProps) => (
  <div className={TABLE_FRAME_CLASS}>
    <table className="w-full min-w-[56rem] border-collapse">
      <caption className="sr-only">Leave</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Person</th>
          <th scope="col" className={TH_CLASS}>Department</th>
          <th scope="col" className={TH_CLASS}>Dates</th>
          <th scope="col" className={cn(TH_CLASS, 'text-right')}>Days</th>
          <th scope="col" className={TH_CLASS}>Status</th>
          <th scope="col" className={TH_CLASS}>Note</th>
          <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {groups.flatMap((group) => group.entries).map((entry) => {
          const work = stillOpenText(entry, today);
          const busy = isBusy(entry.id);
          const note = entry.status === 'DECLINED' && entry.declineNote ? `Declined: ${entry.declineNote}` : entry.reason;
          return (
            <tr key={entry.id} aria-busy={busy || undefined} className={cn(TR_CLASS, 'cursor-default', busy && 'pointer-events-none opacity-50')}>
              <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={entry.userName} size="sm" />
                  <span className="min-w-0 break-words text-sm font-display font-bold leading-snug line-clamp-2 text-text" title={entry.userName}>{entry.mine ? `${entry.userName} (you)` : entry.userName}</span>
                </div>
              </td>
              <td className={TD_CLASS}>{entry.departmentName ?? 'No department'}</td>
              <td className={cn(TD_CLASS, 'whitespace-nowrap tabular-nums')}>{leaveRange(entry)}</td>
              <td className={cn(TD_CLASS, NUM_CLASS, 'whitespace-nowrap')}>{leaveDays(entry)}</td>
              <td className={TD_CLASS}>
                <div className="flex flex-col items-start gap-1">
                  <LeaveStatusChip entry={entry} today={today} />
                  {work && <span className="font-display font-semibold text-vivid-red-text">Still open: {work}</span>}
                </div>
              </td>
              <td className={cn(TD_CLASS, 'max-w-56 truncate')} title={note ?? undefined}>{note ?? <span className="text-text-muted">–</span>}</td>
              <td className={TD_CLASS}><LeaveActionButtons entry={entry} actions={actionsFor(entry)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
));
LeaveTable.displayName = 'LeaveTable';
