import { useMemo, useState } from 'react';
import { CalendarOff, ClipboardList, Info } from 'lucide-react';
import { Button, DateRangePicker, Input, Modal, Skeleton, type DateRangeValue } from '../../components';
import { useAssignableUsersQuery } from '../tickets/hook';
import { AssigneeField } from '../assignees/AssigneeField';
import type { AssignableUser } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { LEAVE_RECORDER_ROLES } from '../../api/auth';
import { useCreateLeaveMutation, useLeavePreviewQuery, useLeaveRulesQuery } from './hook';
import { cn } from '@/lib/utils';

const REASONS = ['Sick', 'Personal', 'Family', 'Travel'] as const;
const SAFE_BACKDATE_DAYS = 1;

const QUICK_RANGES = [
  { label: 'Today', start: 0, length: 1 },
  { label: 'Tomorrow', start: 1, length: 1 },
  { label: 'Next 3 days', start: 0, length: 3 },
  { label: 'Next 7 days', start: 0, length: 7 },
] as const;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const PILL = 'h-11 pointer-fine:h-9 px-3 rounded-lg border t-meta font-display font-semibold touch-manipulation transition-[border-color,background-color,color,transform] duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97]';
const PILL_ON = 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300';
const PILL_OFF = 'border-border/60 bg-surface text-text-secondary hover:border-border-hover';

const label = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface LeaveFormProps {
  onClose: () => void;
  defaultUserId?: string;
}

export const LeaveForm = ({ onClose, defaultUserId }: LeaveFormProps) => {
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const canRecordOthers = !!user && LEAVE_RECORDER_ROLES.includes(user.role);
  const [userId, setUserId] = useState(defaultUserId ?? (canRecordOthers ? '' : myId));
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const [reason, setReason] = useState('');
  const { data: rules } = useLeaveRulesQuery();
  const create = useCreateLeaveMutation();
  const { data: people, isPending: peoplePending } = useAssignableUsersQuery(undefined, undefined, undefined, canRecordOthers);
  const isHead = user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const isOrgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const myDepartmentId = user?.departmentId ?? null;
  const forSelf = userId === myId;
  const isRequest = forSelf && !isOrgWide;

  const pickable = useMemo<AssignableUser[]>(() => {
    const others = (people ?? [])
      .filter((p) => p.id !== myId && p.role !== 'OWNER' && (!isHead || (p.role !== 'ADMIN' && p.role !== 'PC' && !!myDepartmentId && p.departmentId === myDepartmentId)))
      .sort((a, b) => `${a.firstName} ${a.lastName ?? ''}`.localeCompare(`${b.firstName} ${b.lastName ?? ''}`));
    if (!user) return others;
    const me = (people ?? []).find((p) => p.id === myId);
    const self: AssignableUser = { id: myId, firstName: `${me?.firstName ?? user.name ?? 'Me'} (me)`, lastName: me?.lastName ?? null, email: user.email, role: user.role, departmentId: user.departmentId };
    return [self, ...others];
  }, [people, isHead, myId, myDepartmentId, user]);

  const startDate = range.from ? dayKey(range.from) : '';
  const endDate = range.to ? dayKey(range.to) : startDate;
  const ready = !!userId && !!startDate && !!endDate;
  const preview = useLeavePreviewQuery(ready ? { userId, startDate, endDate } : null);
  const days = ready ? Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1 : 0;
  const [openedAt] = useState(() => Date.now());
  const backdateDays = rules?.backdateDays ?? SAFE_BACKDATE_DAYS;
  const minDate = useMemo(() => new Date(openedAt - backdateDays * DAY_MS), [openedAt, backdateDays]);

  const pickQuick = (start: number, length: number) => {
    const first = new Date();
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() + start);
    const last = new Date(first);
    last.setDate(last.getDate() + length - 1);
    setRange({ from: first, to: last });
  };

  const submit = () => {
    if (!ready) return;
    create.mutate({ userId, startDate, endDate, reason: reason.trim() || undefined }, { onSuccess: () => onClose() });
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose} className="max-sm:h-11">Cancel</Button>
      <Button type="button" variant="primary" size="sm" disabled={!ready || preview.isError} isLoading={create.isPending} onClick={submit} className="max-sm:h-11">
        {isRequest ? 'Send request' : 'Save leave'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      icon={<CalendarOff className="size-5" />}
      title={canRecordOthers ? 'Record leave' : 'Ask for leave'}
      description={isRequest
        ? 'Your manager approves it. Once approved, your checklists are skipped on these days so your score does not drop.'
        : 'Their checklists are skipped on these days, so their score does not drop.'}
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <div className="flex flex-col gap-4">
        {canRecordOthers && (
          <div className="flex flex-col gap-1.5">
            <span className="t-meta font-display font-semibold text-text-secondary">Person</span>
            <AssigneeField
              single
              hideLabel
              selectedIds={userId ? [userId] : []}
              onChange={(ids) => setUserId(ids[0] ?? '')}
              users={pickable}
              isLoading={peoplePending}
              emptyText="Nobody you can record leave for."
              pickerTitle="Leave for"
              allowCreate={false}
            />
            {isRequest && <span className="t-meta text-text-muted">Your own leave goes to {isHead ? 'Admin or PC' : 'your manager'} for approval.</span>}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Days off</span>
          <div role="group" aria-label="Quick choices" className="flex flex-wrap gap-1.5">
            {QUICK_RANGES.map((q) => (
              <button key={q.label} type="button" onClick={() => pickQuick(q.start, q.length)} className={cn(PILL, PILL_OFF)}>{q.label}</button>
            ))}
          </div>
          <DateRangePicker value={range} onChange={setRange} hidePresets minDate={minDate} placeholder="Pick the first and last day" className="w-full" triggerClassName="w-full" />
          {ready && <span className="t-meta tabular-nums text-text-muted">{label(days, 'day', 'days')}</span>}
        </div>

        <div className="flex flex-col gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">Reason <span className="font-medium text-text-light">(optional)</span></span>
          <div role="group" aria-label="Reason" className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => {
              const on = reason === r;
              return (
                <button key={r} type="button" aria-pressed={on} onClick={() => setReason(on ? '' : r)} className={cn(PILL, on ? PILL_ON : PILL_OFF)}>{r}</button>
              );
            })}
          </div>
          <Input aria-label="Reason in your own words" placeholder="Or type a reason" value={reason} maxLength={191} onChange={(e) => setReason(e.target.value)} />
        </div>

        {ready && (
          <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/40 p-3" aria-live="polite">
            {preview.isPending ? (
              <>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </>
            ) : preview.isError ? (
              <p role="alert" className="t-meta font-display font-medium text-danger">
                {preview.error instanceof Error ? preview.error.message : "Couldn't check these days."}
              </p>
            ) : (
              <>
                <p className="flex items-start gap-2 t-meta font-display font-semibold text-text">
                  <ClipboardList className="mt-px size-3.5 shrink-0 text-text-light" aria-hidden />
                  {preview.data.runs > 0
                    ? `${label(preview.data.runs, 'checklist', 'checklists')} nobody has started will be removed for these days${isRequest ? ' once approved' : ''}.`
                    : isRequest ? 'Once approved, new checklists are skipped on these days.' : 'No checklists to remove now. New ones are skipped on these days.'}
                </p>
                {(preview.data.openTickets > 0 || preview.data.openDelegations > 0) && (
                  <p className="flex items-start gap-2 t-meta font-display text-text-secondary">
                    <Info className="mt-px size-3.5 shrink-0 text-primary-600" aria-hidden />
                    Still open for {forSelf ? 'you' : 'them'}: {[preview.data.openTickets > 0 && label(preview.data.openTickets, 'ticket', 'tickets'), preview.data.openDelegations > 0 && label(preview.data.openDelegations, 'delegation', 'delegations')].filter(Boolean).join(' and ')}. These are not moved, so hand them over if they cannot wait.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
