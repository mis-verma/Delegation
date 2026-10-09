import { memo, useCallback, useMemo, useState, type FormEvent } from 'react';
import { CalendarOff, CalendarPlus, ChevronDown, Info, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Button, DatePicker, EmptyState, InlineError, Input, NoticeBanner, PageHeader, PANEL_CLASS, PeriodStepper, Skeleton,
} from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { useOrgToday } from '../../checklist/useOrgToday';
import { useCreateHolidayMutation, useCreateHolidaysMutation, useDeleteHolidayMutation, useHolidaysQuery, previewHolidayClears } from './hook';
import type { Holiday } from '../../../api/holidays';

const DAY_MS = 86_400_000;

// Only the fixed-date national holidays. Festival dates (Diwali, Holi, Eid, Dussehra...) move every
// year, so those are added by hand rather than guessed.
const FIXED_NATIONAL = [
  { month: '01', day: '26', name: 'Republic Day' },
  { month: '08', day: '15', name: 'Independence Day' },
  { month: '10', day: '02', name: 'Gandhi Jayanti' },
];

// Hoisted: constructing an Intl formatter per row per render is the costly part.
const FULL_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' });

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const dayNumber = (date: string) => asUtc(date).getTime() / DAY_MS;

// The date picker works in local Dates; the API and the list work in plain YYYY-MM-DD strings.
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const daysUntil = (date: string, today: string) => Math.round(dayNumber(date) - dayNumber(today));
const whenLabel = (diff: number) => (diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff > 1 ? `In ${diff} days` : null);

const HolidayRow = memo(({ holiday, today, onDelete, busy }: { holiday: Holiday; today: string; onDelete: (h: Holiday) => void; busy: boolean }) => {
  const diff = daysUntil(holiday.date, today);
  const past = diff < 0;
  const soon = diff >= 0 && diff <= 7;
  const when = whenLabel(diff);
  const day = asUtc(holiday.date);
  return (
    <li className={cn(PANEL_CLASS, 'flex items-center gap-3.5 p-3 sm:p-3.5 transition-colors duration-150 hover:border-border-hover')}>
      {/* A calendar leaf: the month on top, the day number big, so a list of dates scans at a glance. */}
      <div
        aria-hidden
        className={cn(
          'flex flex-col items-center justify-center size-14 rounded-xl border shrink-0 leading-none',
          soon ? 'border-primary-500/40 bg-primary-500/10' : 'border-border/60 bg-surface-hover',
        )}
      >
        <span className={cn('text-xs font-display font-semibold', soon ? 'text-primary-700 dark:text-primary-300' : 'text-text-muted')}>
          {MONTH_SHORT.format(day)}
        </span>
        <span className={cn('text-xl font-display font-bold tabular-nums pt-0.5', past ? 'text-text-muted' : 'text-text')}>{day.getUTCDate()}</span>
      </div>
      <div className="flex-1 min-w-0">
        {/* Past days read quieter through the muted text token, not opacity, which fails contrast. */}
        <p className={cn('text-sm font-display font-semibold leading-snug', past ? 'text-text-muted' : 'text-text')}>{holiday.name}</p>
        <p className="text-xs font-display text-text-muted">
          {WEEKDAY.format(day)}
          {when && <span className="sm:hidden"> · {when}</span>}
        </p>
      </div>
      {when && (
        <span className={cn(
          'hidden sm:inline-flex items-center h-6 px-2.5 rounded-full text-xs font-display font-semibold shrink-0',
          soon ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'bg-surface-hover text-text-secondary',
        )}>
          {when}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(holiday)}
        disabled={busy}
        aria-label={`Remove ${holiday.name}`}
        title="Remove this holiday"
        className="size-11 sm:size-8 px-0 shrink-0 text-text-light hover:text-danger hover:bg-danger/10"
      >
        <Trash2 size={16} aria-hidden />
      </Button>
    </li>
  );
});
HolidayRow.displayName = 'HolidayRow';

// Same card shape as a real row, so the list does not jump when the holidays land.
const HolidayRowSkeleton = () => (
  <div className={cn(PANEL_CLASS, 'flex items-center gap-3.5 p-3 sm:p-3.5')}>
    <Skeleton className="size-14 rounded-xl shrink-0" />
    <div className="flex flex-col gap-1.5 flex-1">
      <Skeleton className="h-3.5 w-1/3 max-w-40" />
      <Skeleton className="h-3 w-1/4 max-w-24" />
    </div>
  </div>
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className={cn(PANEL_CLASS, 'flex flex-col gap-0.5 p-3 sm:p-3.5 min-w-0')}>
    <span className="text-lg sm:text-xl font-display font-bold text-text tabular-nums leading-tight">{value}</span>
    <span className="text-xs font-display text-text-muted leading-snug line-clamp-2">{label}</span>
  </div>
);

const FIELD_LABEL = 'text-xs font-display font-medium text-text-secondary';

/**
 * Company-wide days off (national holidays). On a holiday the daily checklist generator creates no
 * run, so nobody has anything to miss and no completion or compliance score drops. A checklist
 * someone has already started that day stays, since their answers are real.
 */
export const HolidaysPage = () => {
  const confirm = useConfirm();
  // Kept fresh, so a page left open past midnight does not treat yesterday as today.
  const today = useOrgToday();
  const thisYear = useMemo(() => Number(today.slice(0, 4)), [today]);
  const [year, setYear] = useState(thisYear);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  // Below lg the form sits behind a button so the list is not pushed down the screen.
  const [formOpen, setFormOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const { data: holidays, isPending, isError, isFetching, isPlaceholderData, refetch } = useHolidaysQuery(year);
  const createOne = useCreateHolidayMutation();
  const createMany = useCreateHolidaysMutation();
  const { mutate: removeHoliday, isPending: removing } = useDeleteHolidayMutation();

  // The year as one calendar-ordered list, grouped under its month.
  const months = useMemo(() => {
    const groups: { key: string; label: string; items: Holiday[] }[] = [];
    for (const h of [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
      const key = h.date.slice(0, 7);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: MONTH_LONG.format(asUtc(h.date)), items: [] };
        groups.push(group);
      }
      group.items.push(h);
    }
    return groups;
  }, [holidays]);

  const next = useMemo(() => (holidays ?? []).filter(h => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null, [holidays, today]);
  const total = holidays?.length ?? 0;
  const remaining = useMemo(() => (holidays ?? []).filter(h => h.date >= today).length, [holidays, today]);
  const dateValue = useMemo(() => (date ? fromDateKey(date) : null), [date]);

  // Adding a day that is today or earlier can wipe checklists that already exist for it. Ask the
  // server how many first, and say so before doing it. Dates already on the list are skipped (the
  // add will just report the duplicate). Resolves true when it is fine to go ahead.
  const confirmClears = useCallback(async (dates: string[], label: string): Promise<boolean> => {
    const known = new Set((holidays ?? []).map(h => h.date));
    const risky = dates.filter(d => d <= today && !known.has(d));
    if (risky.length === 0) return true;
    setChecking(true);
    try {
      const { untouchedRuns, startedRuns } = await previewHolidayClears(risky);
      if (untouchedRuns === 0) return true;
      const clears = `This clears ${untouchedRuns} checklist${untouchedRuns === 1 ? '' : 's'} nobody started.`;
      const kept = startedRuns > 0 ? ` ${startedRuns} already started ${startedRuns === 1 ? 'is' : 'are'} kept.` : '';
      return await confirm({
        title: label,
        description: `${clears}${kept}`,
        confirmLabel: 'Add holiday',
        cancelLabel: 'Cancel',
        variant: 'danger',
      });
    } catch {
      toast.error("Couldn't check that date. Try again.");
      return false;
    } finally {
      setChecking(false);
    }
  }, [confirm, holidays, today]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim() || checking) return;
    if (!(await confirmClears([date], `Add ${name.trim()} on ${FULL_DAY.format(asUtc(date))}?`))) return;
    createOne.mutate({ date, name: name.trim() }, { onSuccess: () => { setDate(''); setName(''); setFormOpen(false); } });
  };

  const addNational = async () => {
    const batch = FIXED_NATIONAL.map(h => ({ date: `${year}-${h.month}-${h.day}`, name: h.name }));
    if (checking || !(await confirmClears(batch.map(h => h.date), `Add the national holidays for ${year}?`))) return;
    createMany.mutate(batch);
  };

  const handleDelete = useCallback(async (holiday: Holiday) => {
    // Today and later get their daily checklists back; a past day is never filled in retroactively.
    const day = FULL_DAY.format(asUtc(holiday.date));
    const ok = await confirm({
      title: `Remove ${holiday.name}?`,
      description: holiday.date < today
        ? `${day} is in the past. Removing it only takes it off the list. Past days are not filled in again.`
        : holiday.date === today
          ? `${day} becomes a normal working day again. Today's checklists appear within the hour.`
          : `${day} becomes a normal working day again. Its checklists are created as usual when the day comes.`,
      confirmLabel: 'Remove holiday',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) removeHoliday(holiday.id);
  }, [confirm, removeHoliday, today]);

  // The server accepts 2000 to 2100 only; past that the page would show "couldn't load" with a Retry that can never work.
  const goPrevYear = useCallback(() => setYear(y => Math.max(2000, y - 1)), []);
  const goNextYear = useCallback(() => setYear(y => Math.min(2100, y + 1)), []);
  const goThisYear = useCallback(() => setYear(thisYear), [thisYear]);

  const nextDiff = next ? daysUntil(next.date, today) : null;

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        icon={CalendarOff}
        title="Holidays"
        subtitle="Days off for everyone. No daily checklists are created on these days."
        actions={
          <PeriodStepper
            label={String(year)}
            onPrev={goPrevYear}
            onNext={goNextYear}
            prevLabel="Previous year"
            nextLabel="Next year"
            prevDisabled={year <= 2000}
            nextDisabled={year >= 2100}
            todayLabel={year !== thisYear ? 'This year' : undefined}
            onToday={goThisYear}
          />
        }
      />

      {/* While another year's counts load, the previous year's numbers stay up: dim them so they do not read as this year's. */}
      <div className={cn('grid grid-cols-3 gap-2.5 sm:gap-3 transition-opacity duration-200', isPlaceholderData && 'opacity-50')} aria-busy={isPlaceholderData}>
        <Stat value={String(total)} label={`Holidays in ${year}`} />
        <Stat value={String(remaining)} label="Still to come" />
        <Stat
          value={next ? (nextDiff === 0 ? 'Today' : nextDiff === 1 ? 'Tomorrow' : `${nextDiff} days`) : 'None'}
          label={next ? `Until ${next.name}` : 'Nothing coming up'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex flex-col gap-6 min-w-0 order-2 lg:order-1">
          {isPending && (
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2].map(i => <HolidayRowSkeleton key={i} />)}
            </div>
          )}

          {isError && <InlineError message="We couldn't load the holidays. Check your connection and try again." onRetry={() => refetch()} />}

          {!isPending && !isError && !isFetching && total === 0 && (
            <EmptyState
              icon={CalendarOff}
              title={`No holidays added for ${year}`}
              description="Add one here, or start with the national holidays."
              action={{ label: `Add the national holidays for ${year}`, onClick: () => void addNational(), icon: Wand2 }}
            />
          )}

          {/* keepPreviousData keeps the old year on screen while the next loads: dim it meanwhile. */}
          <div className={cn('flex flex-col gap-6 transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
            {months.map(group => (
              <section key={group.key} aria-label={group.label} className="flex flex-col gap-2.5">
                <h2 className="text-sm font-display font-semibold text-text-secondary">{group.label}</h2>
                <ul className="flex flex-col gap-2">
                  {group.items.map(h => <HolidayRow key={h.id} holiday={h} today={today} onDelete={handleDelete} busy={removing} />)}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4 order-1 lg:order-2 lg:sticky lg:top-4">
          {/* On a phone the form folds away behind this button, so the list is the first thing on screen. */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="lg:hidden gap-2"
            onClick={() => setFormOpen(v => !v)}
            aria-expanded={formOpen}
            aria-controls="holiday-form"
          >
            <CalendarPlus size={16} aria-hidden />
            Add a holiday
            <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-200 motion-reduce:transition-none', formOpen && 'rotate-180')} />
          </Button>
          <form id="holiday-form" onSubmit={submit} className={cn(PANEL_CLASS, 'flex flex-col gap-4 p-4 sm:p-5', !formOpen && 'hidden lg:flex')}>
            <div className="flex items-center gap-2">
              <CalendarPlus size={16} className="text-text-light" aria-hidden />
              <h2 className="text-sm font-display font-semibold text-text">Add a holiday</h2>
            </div>
            <div role="group" aria-labelledby="holiday-date-label" className="flex flex-col gap-1.5">
              <span id="holiday-date-label" className={FIELD_LABEL}>Date</span>
              <DatePicker value={dateValue} onChange={d => setDate(d ? toDateKey(d) : '')} placeholder="Pick a date" triggerClassName="h-11 rounded-xl" />
            </div>
            <Input
              id="holiday-name"
              label="Name"
              labelClassName="text-xs font-display font-medium tracking-normal text-text-secondary px-0"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Diwali"
              className="h-11"
            />
            <Button type="submit" variant="primary" size="lg" disabled={!date || !name.trim()} isLoading={createOne.isPending || checking}>
              Add holiday
            </Button>
            <div className="flex flex-col gap-2.5 pt-4 border-t border-dashed border-border/60">
              <Button type="button" variant="outline" size="sm" onClick={() => void addNational()} isLoading={createMany.isPending || checking} className="self-start">
                <Wand2 size={14} aria-hidden />
                Add national holidays for {year}
              </Button>
              <p className="text-xs font-display text-text-muted leading-relaxed">
                Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct). Festival dates change every year, so add those yourself.
              </p>
            </div>
          </form>

          {/* Background reading: desktop only, so a phone gets the list first. */}
          <div className="hidden lg:block">
            <NoticeBanner tone="info" icon={Info}>
              Nobody can miss a checklist that does not exist, so scores do not drop. One a person has already started that
              day stays. Adding a date that has passed also clears that day's unfilled checklists.
            </NoticeBanner>
          </div>
        </aside>
      </div>
    </div>
  );
};
