import { useMemo, useState } from 'react';
import { CalendarClock, Info, UserCheck, UserMinus, X } from 'lucide-react';
import { Button, DateRangePicker, InlineError, Input, NoticeBanner, SelectDropdown, Skeleton, type DateRangeValue } from '../../components';
import { endOfDay } from '../../lib/dateRange';
import { useAuth } from '../../context/AuthContext';
import { BuilderField, BuilderSection } from './definition/builder/BuilderSection';
import { formatDate } from './checklistDisplay';
import { useApprovalCoverQuery, useCoverPeopleQuery, useStartApprovalCoverMutation, useStopApprovalCoverMutation } from './useApprovalCover';
import type { ApprovalCoverRow } from '../../api/approvalCover';

const COVER_ROLES = new Set(['ADMIN', 'PC', 'MANAGER', 'SENIOR']);

const CoverLine = ({ row, mine, onStop, stopping }: { row: ApprovalCoverRow; mine: boolean; onStop: (id: string) => void; stopping: boolean }) => (
  <li className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-3">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300" aria-hidden="true">
      <UserCheck size={18} strokeWidth={2.25} />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="t-card font-display font-bold text-text">{mine ? row.toName : row.fromName}</span>
      <span className="t-meta text-text-muted">
        {mine ? 'Approves for you' : 'You approve for them'} {row.active ? 'until' : 'from'} {row.active ? formatDate(row.endsAt) : `${formatDate(row.startsAt)} to ${formatDate(row.endsAt)}`}
        {row.note ? `. ${row.note}` : ''}
      </span>
    </span>
    <Button variant="outline" size="sm" onClick={() => onStop(row.id)} disabled={stopping} className="shrink-0 pointer-coarse:min-h-11" aria-label={`Stop the cover with ${mine ? row.toName : row.fromName}`}>
      <X size={14} aria-hidden="true" />
      Stop
    </Button>
  </li>
);

export const ApprovalCoverCard = () => {
  const { user } = useAuth();
  const allowed = !!user && COVER_ROLES.has(user.role);
  const cover = useApprovalCoverQuery();
  const people = useCoverPeopleQuery();
  const start = useStartApprovalCoverMutation();
  const stop = useStopApprovalCoverMutation();
  const [toUserId, setToUserId] = useState('');
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const [note, setNote] = useState('');

  const options = useMemo(
    () => [{ value: '', label: people.isPending ? 'Loading people' : 'Pick a person' }, ...(people.data ?? []).map((p) => ({ value: p.id, label: p.name }))],
    [people.data, people.isPending],
  );

  if (!allowed) return null;

  const canStart = !!toUserId && !!range.to && !start.isPending;
  const submit = () => {
    if (!canStart || !range.to) return;
    const from = range.from && range.from.getTime() > Date.now() ? range.from : null;
    start.mutate(
      { toUserId, endsAt: endOfDay(range.to).toISOString(), ...(from ? { startsAt: from.toISOString() } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: () => { setToUserId(''); setRange({ from: null, to: null }); setNote(''); } },
    );
  };

  const received = cover.data?.received ?? [];
  const given = cover.data?.given ?? [];

  return (
    <BuilderSection icon={UserCheck} title="Approval cover" hint="Going on leave? Let someone else approve for you.">
      {cover.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : cover.isError ? (
        <InlineError message="We couldn't load your covers." onRetry={() => void cover.refetch()} />
      ) : (
        <>
          {received.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="People you are covering">
              {received.map((row) => (
                <CoverLine key={row.id} row={row} mine={false} onStop={(id) => stop.mutate(id)} stopping={stop.isPending} />
              ))}
            </ul>
          )}
          {given.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="People covering for you">
              {given.map((row) => (
                <CoverLine key={row.id} row={row} mine onStop={(id) => stop.mutate(id)} stopping={stop.isPending} />
              ))}
            </ul>
          )}
        </>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BuilderField label="Who approves for you">
          <SelectDropdown
            value={toUserId}
            onChange={setToUserId}
            options={options}
            aria-label="Person who will approve for you"
          />
        </BuilderField>
        <BuilderField label="Until when">
          <DateRangePicker value={range} onChange={setRange} placeholder="Pick the leave dates" />
        </BuilderField>
      </div>
      <Input
        label="Note (optional)"
        labelClassName="t-meta font-display font-semibold text-text-secondary"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={191}
        placeholder="e.g. On leave, back on the 4th"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="primary" onClick={submit} isLoading={start.isPending} disabled={!canStart} className="w-full gap-1.5 font-display pointer-coarse:min-h-11 sm:w-fit">
          {!start.isPending && <CalendarClock size={15} aria-hidden="true" />}
          Start cover
        </Button>
      </div>

      <NoticeBanner tone="info" icon={Info}>
        Until the end date they can decide on the checklists, tickets and delegations you can, and they get the same reminders. Nobody can approve work they do themselves. You can stop it any time.
      </NoticeBanner>
      {options.length === 1 && !people.isPending && (
        <p className="flex items-center gap-1.5 t-meta font-display text-text-muted">
          <UserMinus size={13} aria-hidden="true" />
          No other approver found to cover for you.
        </p>
      )}
    </BuilderSection>
  );
};
