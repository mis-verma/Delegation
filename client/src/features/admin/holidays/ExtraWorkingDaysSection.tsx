import { memo, useCallback, useMemo, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, DatePicker, EmptyState, InlineError, Input, PANEL_CLASS, Skeleton, ToggleChip } from '../../../components';
import { UserMultiSelect } from '../../../components/userMultiSelect/UserMultiSelect';
import { useConfirm } from '@/components/confirmDialog';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { useCreateExtraWorkingDayMutation, useDeleteExtraWorkingDayMutation, useExtraWorkingDaysQuery } from './hook';
import type { ExtraWorkingDay, ExtraWorkingDayScope } from '../../../api/extraWorkingDays';

const SCOPES: readonly ExtraWorkingDayScope[] = ['ALL', 'DEPARTMENT', 'STORE', 'PEOPLE'];
const SCOPE_LABEL: Record<ExtraWorkingDayScope, string> = { ALL: 'Everyone', DEPARTMENT: 'Departments', STORE: 'Stores', PEOPLE: 'People' };

const FULL_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const FIELD_LABEL = 'text-xs font-display font-medium text-text-secondary';

const ExtraDayRow = memo(({ day, who, today, onDelete, busy }: { day: ExtraWorkingDay; who: string; today: string; onDelete: (d: ExtraWorkingDay) => void; busy: boolean }) => {
  const date = asUtc(day.date);
  const past = day.date < today;
  return (
    <li className={cn(PANEL_CLASS, 'flex items-center gap-3.5 p-3 sm:p-3.5 transition-colors duration-150 hover:border-border-hover')}>
      <div aria-hidden className={cn('flex flex-col items-center justify-center size-14 rounded-xl border shrink-0 leading-none', past ? 'border-border/60 bg-surface-hover' : 'border-success/40 bg-success/10')}>
        <span className={cn('text-xs font-display font-semibold', past ? 'text-text-muted' : 'text-success')}>{MONTH_SHORT.format(date)}</span>
        <span className={cn('text-xl font-display font-bold tabular-nums pt-0.5', past ? 'text-text-muted' : 'text-text')}>{date.getUTCDate()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-display font-semibold leading-snug', past ? 'text-text-muted' : 'text-text')}>{day.reason}</p>
        <p className="t-meta text-text-muted truncate">{WEEKDAY.format(date)} · {who}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(day)}
        disabled={busy}
        aria-label={`Remove the extra working day on ${FULL_DAY.format(date)}`}
        className="size-11 sm:size-8 px-0 shrink-0 text-text-light hover:text-danger hover:bg-danger/10"
      >
        <Trash2 size={16} aria-hidden />
      </Button>
    </li>
  );
});
ExtraDayRow.displayName = 'ExtraDayRow';

/**
 * Days people work although they are normally off: Sunday overtime, a stock-count weekend. On such a day
 * the daily checklists run for the people it covers, whatever the checklist's working days, their own
 * week-off or a holiday say. Everyone else stays off, so nobody is marked as missing anything.
 */
export const ExtraWorkingDaysSection = ({ year, today }: { year: number; today: string }) => {
  const confirm = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<ExtraWorkingDayScope>('ALL');
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const { data: days, isPending, isError, refetch } = useExtraWorkingDaysQuery(year);
  const create = useCreateExtraWorkingDayMutation();
  const { mutate: remove, isPending: removing } = useDeleteExtraWorkingDayMutation();
  const { data: departments = [] } = useDepartmentsQuery();
  const { data: stores = [] } = useStoresQuery();

  const nameOf = useMemo(() => {
    const map = new Map<string, string>([...departments.map((d) => [d.id, d.name] as const), ...stores.map((s) => [s.id, s.name] as const)]);
    return (id: string) => map.get(id) ?? '';
  }, [departments, stores]);
  const whoOf = useCallback((d: ExtraWorkingDay) => {
    if (d.scope === 'ALL') return 'Everyone works';
    if (d.scope === 'PEOPLE') return `${d.targetIds.length} ${d.targetIds.length === 1 ? 'person works' : 'people work'}`;
    const names = d.targetIds.map(nameOf).filter(Boolean);
    return names.length ? names.join(', ') : `${d.targetIds.length} ${d.scope === 'DEPARTMENT' ? 'departments' : 'stores'}`;
  }, [nameOf]);

  const sorted = useMemo(() => [...(days ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const toggle = (id: string) => setTargetIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const canSave = !!date && !!reason.trim() && (scope === 'ALL' || targetIds.length > 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    create.mutate(
      { date, reason: reason.trim(), scope, targetIds: scope === 'ALL' ? [] : targetIds },
      { onSuccess: () => { setDate(''); setReason(''); setScope('ALL'); setTargetIds([]); setFormOpen(false); } },
    );
  };

  const handleDelete = useCallback(async (day: ExtraWorkingDay) => {
    const label = FULL_DAY.format(asUtc(day.date));
    const ok = await confirm({
      title: `Remove the extra working day on ${label}?`,
      description: day.date === today
        ? "It becomes a normal day off again. Today's checklists nobody started are taken off people's lists."
        : 'It becomes a normal day off again. No checklists are created for it.',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) remove(day.id);
  }, [confirm, remove, today]);

  return (
    <section aria-labelledby="extra-days-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="extra-days-heading" className="t-section font-display font-bold text-text">Extra working days</h2>
          <p className="t-meta text-text-muted">Sunday overtime and other days people work although they are normally off. Their checklists run that day; everyone else stays off.</p>
        </div>
        <Button type="button" variant={formOpen ? 'outline' : 'primary'} size="sm" onClick={() => setFormOpen((v) => !v)} aria-expanded={formOpen} aria-controls="extra-day-form" className="gap-1.5 pointer-coarse:min-h-11">
          <BriefcaseBusiness size={14} aria-hidden />
          Add an extra working day
          <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-200', formOpen && 'rotate-180')} />
        </Button>
      </div>

      {formOpen && (
        <form id="extra-day-form" onSubmit={submit} className={cn(PANEL_CLASS, 'flex flex-col gap-4 p-4 sm:p-5')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div role="group" aria-labelledby="extra-day-date-label" className="flex flex-col gap-1.5">
              <span id="extra-day-date-label" className={FIELD_LABEL}>Date</span>
              <DatePicker value={date ? fromDateKey(date) : null} onChange={(d) => setDate(d ? toDateKey(d) : '')} placeholder="Pick a date" minDate={fromDateKey(today)} triggerClassName="h-11 rounded-xl" />
            </div>
            <Input
              id="extra-day-reason"
              label="Reason"
              labelClassName="text-xs font-display font-medium tracking-normal text-text-secondary px-0"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={100}
              placeholder="e.g. Diwali stock overtime"
              className="h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Who works</span>
            <PeriodTabControl value={scope} options={SCOPES} labels={SCOPE_LABEL} onChange={(next) => { setScope(next); setTargetIds([]); }} fill />
          </div>

          {scope === 'DEPARTMENT' && (
            <div className="flex flex-wrap gap-2">
              {departments.filter((d) => d.isActive !== false).map((d) => <ToggleChip key={d.id} on={targetIds.includes(d.id)} onClick={() => toggle(d.id)}>{d.name}</ToggleChip>)}
            </div>
          )}
          {scope === 'STORE' && (
            <div className="flex flex-wrap gap-2">
              {stores.filter((s) => s.isActive !== false).map((s) => <ToggleChip key={s.id} on={targetIds.includes(s.id)} onClick={() => toggle(s.id)}>{s.name}</ToggleChip>)}
            </div>
          )}
          {scope === 'PEOPLE' && <UserMultiSelect selected={targetIds} onChange={setTargetIds} departments={departments} />}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={!canSave} isLoading={create.isPending}>Add extra working day</Button>
          </div>
        </form>
      )}

      {isError ? (
        <InlineError message="We couldn't load the extra working days." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : sorted.length === 0 ? (
        <EmptyState size="compact" icon={BriefcaseBusiness} title={`No extra working days in ${year}`} description="Add one when people work on a day that is normally off." />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((d) => <ExtraDayRow key={d.id} day={d} who={whoOf(d)} today={today} onDelete={handleDelete} busy={removing} />)}
        </ul>
      )}
    </section>
  );
};
