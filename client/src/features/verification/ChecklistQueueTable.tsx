import { memo } from 'react';
import { Check, CornerUpLeft, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TD_CLASS } from '../../components/dataTable';
import { complianceToneClass } from '../checklist/checklistDisplay';
import { stageLabel } from '../checklist/approvalStage';
import { formatDateTime } from '../checklist/checklistDisplay';
import { GROUP_LOOK } from './checklistQueueLayout';
import { formatWaiting, groupOf, type ChecklistRow } from './verificationModel';
import { useSharedNow } from '../../lib/useSharedNow';

// Gutter (0) + Checklist (1) stay frozen; everything else scrolls under them.
const COL_WIDTHS = ['0.375rem', '17rem', '10rem', '13rem', '7rem', '9rem', '10rem', '10rem'] as const;
const STICKY_LEFT = [0, 0.375] as const;
const STICKY_CELL = 'sticky z-10 bg-surface transition-colors group-hover:bg-surface-hover';

interface ChecklistQueueTableProps {
  rows: ChecklistRow[];
  activeId: string | null;
  showDepartment?: boolean;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onSendBack: (id: string) => void;
}

const TableRow = memo(function TableRow({
  row, active, showDepartment, onOpen, onApprove, onSendBack,
}: { row: ChecklistRow; active: boolean; showDepartment: boolean; onOpen: (id: string) => void; onApprove: (id: string) => void; onSendBack: (id: string) => void }) {
  const now = useSharedNow();
  const { id, instance, risk } = row;
  const group = groupOf(row);
  const look = GROUP_LOOK[group];
  const percent = risk.compliance ?? 100;
  const waiting = formatWaiting(row.waitingSince, now);
  const stage = stageLabel(instance);
  const submitted = instance.submittedAt
    ? `${instance.submittedByName ?? 'Submitted'}${stage ? ` · ${stage}` : ''}`
    : 'Not submitted yet';

  return (
    <tr className={cn('group cursor-pointer border-t border-border/60', look.tint)} onClick={() => onOpen(id)}>
      <td style={{ left: `${STICKY_LEFT[0]}rem` }} className={cn(STICKY_CELL, 'p-0')}>
        <span className={cn('block h-full w-full', look.accentBar)} aria-hidden="true" />
      </td>
      <th scope="row" style={{ left: `${STICKY_LEFT[1]}rem` }} className={cn(TD_CLASS, STICKY_CELL, 'font-normal text-left align-middle')}>
        <span className={cn('block t-card font-display leading-snug line-clamp-2', active ? 'font-bold' : 'font-semibold', 'text-text')}>{instance.title}</span>
      </th>
      <td className={cn(TD_CLASS, 'border-l border-border/40')}>
        <span className="flex flex-col gap-0.5 t-meta text-text-muted">
          {row.storeName && <span className="inline-flex items-center gap-1 truncate"><Store size={11} aria-hidden /> {row.storeName}</span>}
          {showDepartment && <span className="truncate">{row.deptName}</span>}
        </span>
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/40 truncate')} title={instance.submittedAt ? formatDateTime(instance.submittedAt) : undefined}>
        {submitted}
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/40 whitespace-nowrap tabular-nums', (now - row.waitingSince) / 86_400_000 >= 3 && 'text-warning font-semibold')}>
        {waiting}
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/40 tabular-nums font-display font-bold', complianceToneClass(percent))}>
        {percent}%
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/40')}>
        <span className={cn('inline-flex items-center gap-1.5 t-meta font-display font-semibold', look.text)}>
          <look.icon size={14} aria-hidden />
          {look.label}
        </span>
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/40 text-right')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" variant="outline" aria-label={`Send back ${instance.title}`} title="Send back" className="border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger" onClick={() => onSendBack(id)}>
            <CornerUpLeft size={13} aria-hidden />
          </Button>
          <Button size="sm" className="bg-success-strong text-white hover:bg-success-strong/90 hover:text-white" onClick={() => onApprove(id)}>
            <Check size={13} aria-hidden />
            Approve
          </Button>
        </div>
      </td>
    </tr>
  );
});

export const ChecklistQueueTable = memo(function ChecklistQueueTable({
  rows, activeId, showDepartment = true, onOpen, onApprove, onSendBack,
}: ChecklistQueueTableProps) {
  return (
    <div className={TABLE_FRAME_CLASS}>
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Checklists waiting for approval</caption>
        <colgroup>
          {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" style={{ left: `${STICKY_LEFT[0]}rem` }} className={cn(TH_CLASS, 'sticky z-30 p-0')}><span className="sr-only">Status</span></th>
            <th scope="col" style={{ left: `${STICKY_LEFT[1]}rem` }} className={cn(TH_CLASS, 'sticky z-30')}>Checklist</th>
            <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-700/40')}>Store / dept</th>
            <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-700/40')}>Submitted by</th>
            <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-700/40')}>Waiting</th>
            <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-700/40')}>Compliance</th>
            <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-700/40')}>Status</th>
            <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-700/40 text-right')}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              row={row}
              active={row.id === activeId}
              showDepartment={showDepartment}
              onOpen={onOpen}
              onApprove={onApprove}
              onSendBack={onSendBack}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});
