import { memo, useCallback, useMemo, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, CalendarOff, CalendarPlus, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppliedFilterChip, Button, DatePicker, EmptyState, IconChip, InlineError, Input, PANEL_CLASS, Skeleton, ToggleChip } from '../../../components';
import { UserMultiSelect } from '../../../components/userMultiSelect/UserMultiSelect';
import { useConfirm } from '@/components/confirmDialog';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useAssignableUsersQuery, useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { useCreateExtraWorkingDayMutation, useDeleteExtraWorkingDayMutation, useExtraWorkingDaysQuery } from './hook';
import type { ExtraWorkingDay, ExtraWorkingDayScope } from '../../../api/extraWorkingDays';

const SCOPES: readonly ExtraWorkingDayScope[] = ['ALL', 'DEPARTMENT', 'STORE', 'PEOPLE'];
const SCOPE_LABEL: Record<ExtraWorkingDayScope, string> = { ALL: 'Everyone', DEPARTMENT: 'Departments', STORE: 'Stores', PEOPLE: 'People' };
const MAX_DATES = 31;
const NAMES_SHOWN = 3;

const FULL_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const utcKey = (d: Date) => d.toISOString().slice(0, 10);

const sundaysFrom = (today: string, untilMonthEnd: boolean): string[] => {
  const start = asUtc(today);
  const first = new Date(start);
  first.setUTCDate(start.getUTCDate() + ((7 - start.getUTCDay()) % 7));
  if (!untilMonthEnd) return [utcKey(first)];
  const out: string[] = [];
  for (const d = new Date(first); d.getUTCMonth() === start.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 7)) out.push(utcKey(d));
  return out;
};

const listNames = (names: string[]) =>
  names.length > NAMES_SHOWN ? `${names.slice(0, NAMES_SHOWN).join(', ')} +${names.length - NAMES_SHOWN} more` : names.join(', ');

const FIELD_LABEL = 't-meta font-display font-medium text-text-secondary';

const ExtraDayRow = memo(({ day, who, holidayName, today, onDelete, busy }: { day: ExtraWorkingDay; who: string; holidayName?: string; today: string; onDelete: (d: ExtraWorkingDay) => void; busy: boolean }) => {
  const date = asUtc(day.date);
  const past = day.date < today;
  return (
    <li className={cn(PANEL_CLASS, 'flex items-center gap-3.5 p-3 sm:p-3.5 transition-colors duration-150 hover:border-border-hover')}>
      <div aria-hidden className={cn('flex flex-col items-center justify-center size-14 rounded-xl border shrink-0 leading-none', past ? 'border-border/60 bg-surface-hover' : 'border-success/40 bg-success/10')}>
        <span className={cn('t-meta font-display font-semibold', past ? 'text-text-muted' : 'text-success')}>{MONTH_SHORT.format(date)}</span>
        <span className={cn('text-xl font-display font-bold tabular-nums pt-0.5', past ? 'text-text-muted' : 'text-text')}>{date.getUTCDate()}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className={cn('text-sm font-display font-semibold leading-snug', past ? 'text-text-muted' : 'text-text')}>{day.reason}</p>
        <p className="t-meta text-text-muted">{WEEKDAY.format(date)} · {who}</p>
        {holidayName && <IconChip icon={CalendarOff} tone="bg-primary-600" label={`Also ${holidayName}: only these people work`} className="self-start" />}
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

export const ExtraWorkingDaysSection = ({ year, today, holidayNames }: { year: number; today: string; holidayNames: ReadonlyMap<string, string> }) => {
  const confirm = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<ExtraWorkingDayScope>('ALL');
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const { data: days, isPending, isError, refetch } = useExtraWorkingDaysQuery(year);
  const create = useCreateExtraWorkingDayMutation();
  const { mutate: remove, isPending: removing } = useDeleteExtraWorkingDayMutation();
  const { data: departments = [] } = useDepartmentsQuery();
  const { data: stores = [] } = useStoresQuery();
  const { data: people = [] } = useAssignableUsersQuery();

  const nameOf = useMemo(() => new Map<string, string>([
    ...departments.map((d) => [d.id, d.name] as const),
    ...stores.map((s) => [s.id, s.name] as const),
    ...people.map((u) => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()] as const),
  ]), [departments, stores, people]);
  const whoOf = useCallback((d: ExtraWorkingDay) => {
    if (d.scope === 'ALL') return 'Everyone works';
    const names = d.targetIds.map((id) => nameOf.get(id)).filter((n): n is string => !!n);
    if (names.length) return listNames(names);
    const unit = d.scope === 'PEOPLE' ? 'people' : d.scope === 'DEPARTMENT' ? 'departments' : 'stores';
    return `${d.targetIds.length} ${unit}`;
  }, [nameOf]);

  const sorted = useMemo(() => [...(days ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const toggle = (id: string) => setTargetIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const addDates = (more: string[]) => setDates((current) => [...new Set([...current, ...more.filter((d) => d >= today)])].sort().slice(0, MAX_DATES));
  const nextSunday = useMemo(() => sundaysFrom(today, false), [today]);
  const sundaysThisMonth = useMemo(() => sundaysFrom(today, true), [today]);
  const canSave = dates.length > 0 && !!reason.trim() && (scope === 'ALL' || targetIds.length > 0);
  const reset = () => { setDates([]); setReason(''); setScope('ALL'); setTargetIds([]); setFormOpen(false); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    create.mutate({ dates, reason: reason.trim(), scope, targetIds: scope === 'ALL' ? [] : targetIds }, { onSuccess: reset });
  };

  const handleDelete = useCallback(async (day: ExtraWorkingDay) => {
    const label = FULL_DAY.format(asUtc(day.date));
    const ok = await confirm({
      title: `Remove the extra working day on ${label}?`,
      description: day.date >= today
        ? "It becomes a normal day off again. Checklists for that day that nobody started are taken off people's lists."
        : 'It is in the past, so it only comes off the list.',
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
          <p className="t-meta text-text-muted">Sunday overtime and other days people work although they are normally off, even on a holiday. Their checklists run that day; everyone else stays off.</p>
        </div>
        <Button type="button" variant={formOpen ? 'outline' : 'primary'} size="sm" onClick={() => setFormOpen((v) => !v)} aria-expanded={formOpen} aria-controls="extra-day-form" className="gap-1.5 pointer-coarse:min-h-11">
          <BriefcaseBusiness size={14} aria-hidden />
          Add extra working days
          <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-200', formOpen && 'rotate-180')} />
        </Button>
      </div>

      {formOpen && (
        <form id="extra-day-form" onSubmit={submit} className={cn(PANEL_CLASS, 'flex flex-col gap-4 p-4 sm:p-5')}>
          <div className="flex flex-col gap-2">
            <span id="extra-day-date-label" className={FIELD_LABEL}>Dates</span>
            <div role="group" aria-labelledby="extra-day-date-label" className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-56">
                <DatePicker value={null} onChange={(d) => d && addDates([toDateKey(d)])} placeholder="Add a date" minDate={fromDateKey(today)} triggerClassName="h-11 rounded-xl" />
              </div>
              <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={() => addDates(nextSunday)}>
                <CalendarPlus size={14} aria-hidden />
                Next Sunday
              </Button>
              {sundaysThisMonth.length > 1 && (
                <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={() => addDates(sundaysThisMonth)}>
                  <CalendarPlus size={14} aria-hidden />
                  Every Sunday left this month ({sundaysThisMonth.length})
                </Button>
              )}
            </div>
            {dates.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Picked dates">
                {dates.map((d) => (
                  <AppliedFilterChip
                    key={d}
                    label={holidayNames.has(d) ? `${SHORT_DAY.format(asUtc(d))} (${holidayNames.get(d)})` : SHORT_DAY.format(asUtc(d))}
                    onRemove={() => setDates((current) => current.filter((x) => x !== d))}
                  />
                ))}
              </div>
            ) : (
              <p className="t-meta text-text-muted">Pick one or more days. Each one gets its own entry.</p>
            )}
          </div>

          <Input
            id="extra-day-reason"
            label="Reason"
            labelClassName="t-meta font-display font-medium tracking-normal text-text-secondary px-0"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={100}
            placeholder="e.g. Diwali stock overtime"
            className="h-11"
          />

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
            <Button type="button" variant="ghost" size="sm" onClick={reset}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={!canSave} isLoading={create.isPending}>
              {dates.length > 1 ? `Add ${dates.length} extra working days` : 'Add extra working day'}
            </Button>
          </div>
        </form>
      )}

      {isError ? (
        <InlineError message="We couldn't load the extra working days." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : sorted.length === 0 ? (
        <EmptyState size="compact" icon={BriefcaseBusiness} title={`No extra working days in ${year}`} description="Add one when people work on a day that is normally off. Next Sunday is one tap away." />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((d) => <ExtraDayRow key={d.id} day={d} who={whoOf(d)} holidayName={holidayNames.get(d.date)} today={today} onDelete={handleDelete} busy={removing} />)}
        </ul>
      )}
    </section>
  );
};
