import { useMemo, useState } from 'react';
import { CalendarOff, ClipboardList, Info } from 'lucide-react';
import { Button, Combobox, DateRangePicker, Input, Modal, Skeleton, type DateRangeValue } from '../../components';
import { useAssignableUsersQuery } from '../tickets/hook';
import { useCreateLeaveMutation, useLeavePreviewQuery } from './hook';
import { cn } from '@/lib/utils';

const REASONS = ['Sick', 'Personal', 'Family', 'Travel'] as const;
const BACKDATE_DAYS = 14;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const PILL = 'h-9 pointer-coarse:h-10 px-3 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97]';
const PILL_ON = 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300';
const PILL_OFF = 'border-border/60 bg-surface text-text-secondary hover:border-border-hover';

const label = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface LeaveFormProps {
  onClose: () => void;
  defaultUserId?: string;
}

export const LeaveForm = ({ onClose, defaultUserId }: LeaveFormProps) => {
  const [userId, setUserId] = useState(defaultUserId ?? '');
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const [reason, setReason] = useState('');
  const create = useCreateLeaveMutation();
  const { data: people, isPending: peoplePending } = useAssignableUsersQuery();

  const options = useMemo(
    () => (people ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName ?? ''}`.trim() })).sort((a, b) => a.label.localeCompare(b.label)),
    [people],
  );

  const startDate = range.from ? dayKey(range.from) : '';
  const endDate = range.to ? dayKey(range.to) : startDate;
  const ready = !!userId && !!startDate && !!endDate;
  const preview = useLeavePreviewQuery(ready ? { userId, startDate, endDate } : null);
  const days = ready ? Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1 : 0;
  const [minDate] = useState(() => new Date(Date.now() - BACKDATE_DAYS * DAY_MS));

  const submit = () => {
    if (!ready) return;
    create.mutate({ userId, startDate, endDate, reason: reason.trim() || undefined }, { onSuccess: () => onClose() });
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose} className="max-sm:h-11">Cancel</Button>
      <Button type="button" variant="primary" size="sm" disabled={!ready || preview.isError} isLoading={create.isPending} onClick={submit} className="max-sm:h-11">
        Save leave
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      icon={<CalendarOff className="size-5" />}
      title="Record leave"
      description="Their checklists are skipped on these days, so their score does not drop."
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Person</span>
          <Combobox
            value={userId}
            onChange={setUserId}
            options={options}
            isLoading={peoplePending}
            placeholder="Search people..."
            emptyOptionLabel="Choose a person"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Days off</span>
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
                    ? `${label(preview.data.runs, 'checklist', 'checklists')} nobody has started will be removed for these days.`
                    : 'No checklists to remove now. New ones are skipped on these days.'}
                </p>
                {(preview.data.openTickets > 0 || preview.data.openDelegations > 0) && (
                  <p className="flex items-start gap-2 t-meta font-display text-text-secondary">
                    <Info className="mt-px size-3.5 shrink-0 text-primary-600" aria-hidden />
                    Still open for them: {[preview.data.openTickets > 0 && label(preview.data.openTickets, 'ticket', 'tickets'), preview.data.openDelegations > 0 && label(preview.data.openDelegations, 'delegation', 'delegations')].filter(Boolean).join(' and ')}. These are not moved, so hand them over if they cannot wait.
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
