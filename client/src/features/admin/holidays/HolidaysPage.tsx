import { useMemo, useState, type FormEvent } from 'react';
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight, Info, Trash2, Wand2 } from 'lucide-react';
import { Button, EmptyState, GradientIconTile, Skeleton } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { todayPeriodBoundIso } from '../../checklist/checklistDisplay';
import { useCreateHolidayMutation, useCreateHolidaysMutation, useDeleteHolidayMutation, useHolidaysQuery } from './hook';
import type { Holiday } from '../../../api/holidays';

const DAY_MS = 86_400_000;

// Only the fixed-date national holidays. Festival dates (Diwali, Holi, Eid, Dussehra...) move every
// year, so those are added by hand rather than guessed.
const FIXED_NATIONAL = [
  { month: '01', day: '26', name: 'Republic Day' },
  { month: '08', day: '15', name: 'Independence Day' },
  { month: '10', day: '02', name: 'Gandhi Jayanti' },
];

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const formatDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const whenLabel = (date: string, today: string) => {
  const diff = Math.round(dayNumber(date) - dayNumber(today));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1) return `In ${diff} days`;
  return null;
};

const HolidayRow = ({ holiday, today, onDelete, busy }: { holiday: Holiday; today: string; onDelete: (h: Holiday) => void; busy: boolean }) => {
  const when = whenLabel(holiday.date, today);
  const past = holiday.date < today;
  return (
    <li className={`flex items-center gap-3 p-3.5 rounded-lg border border-border/60 bg-surface ${past ? 'opacity-70' : ''}`}>
      <span className="flex items-center justify-center size-10 rounded-xl bg-primary-500/10 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300 shrink-0">
        <CalendarOff size={18} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold text-text leading-snug">{holiday.name}</p>
        <p className="text-xs text-text-muted">{formatDay(holiday.date)}</p>
      </div>
      {when && (
        <span className="hidden sm:inline-flex items-center h-6 px-2.5 rounded-full bg-primary-500/10 dark:bg-primary-500/15 text-[11px] font-display font-semibold text-primary-700 dark:text-primary-300 shrink-0">
          {when}
        </span>
      )}
      <button
        type="button"
        onClick={() => onDelete(holiday)}
        disabled={busy}
        aria-label={`Remove ${holiday.name}`}
        title="Remove this holiday"
        className="flex items-center justify-center size-11 sm:size-9 rounded-lg text-text-light hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-danger/40 shrink-0"
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </li>
  );
};

/**
 * Company-wide days off (national holidays). On a holiday the daily checklist generator creates no
 * run, so nobody has anything to miss and no completion or compliance score drops. A checklist
 * someone has already started that day stays, since their answers are real.
 */
export const HolidaysPage = () => {
  const confirm = useConfirm();
  const today = useMemo(() => todayPeriodBoundIso().slice(0, 10), []);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const { data: holidays = [], isPending, isError, refetch } = useHolidaysQuery(year);
  const createOne = useCreateHolidayMutation();
  const createMany = useCreateHolidaysMutation();
  const remove = useDeleteHolidayMutation();

  const upcoming = holidays.filter(h => h.date >= today);
  const past = holidays.filter(h => h.date < today).reverse();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) return;
    createOne.mutate({ date, name: name.trim() }, { onSuccess: () => { setDate(''); setName(''); } });
  };

  const addNational = () =>
    createMany.mutate(FIXED_NATIONAL.map(h => ({ date: `${year}-${h.month}-${h.day}`, name: h.name })));

  const handleDelete = async (holiday: Holiday) => {
    const ok = await confirm({
      title: `Remove ${holiday.name}?`,
      description: `${formatDay(holiday.date)} becomes a normal working day again, and daily checklists are created for it.`,
      confirmLabel: 'Remove holiday',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) remove.mutate(holiday.id);
  };

  const inputClass = 'h-11 sm:h-10 px-3 rounded-lg border border-border/60 bg-surface text-base sm:text-sm text-text placeholder:text-text-muted transition-[border-color,box-shadow] duration-150 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={CalendarOff} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Holidays</h1>
          <p className="text-sm text-text-muted mt-0.5">Days off for everyone. No daily checklists are created on these days.</p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-primary-500/10 dark:bg-primary-500/15 border border-primary-500/20 text-xs font-display text-text-secondary leading-relaxed">
        <Info size={15} className="text-primary-600 dark:text-primary-300 shrink-0 mt-0.5" aria-hidden />
        <span>
          Nobody can miss a checklist that doesn't exist, so scores don't drop. One a person has already started that
          day stays. Adding a date that has passed also clears that day's unfilled checklists.
        </span>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 p-4 sm:p-5 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2">
          <CalendarPlus size={16} className="text-text-light" aria-hidden />
          <span className="text-sm font-display font-semibold text-text">Add a holiday</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="holiday-date" className="text-xs font-display font-medium text-text-secondary">Date</label>
            <input id="holiday-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <label htmlFor="holiday-name" className="text-xs font-display font-medium text-text-secondary">Name</label>
            <input
              id="holiday-name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Diwali"
              className={inputClass}
            />
          </div>
          <Button type="submit" variant="primary" disabled={!date || !name.trim()} isLoading={createOne.isPending} className="h-11 sm:h-10">
            Add holiday
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 border-t border-dashed border-border/60">
          <Button type="button" variant="outline" size="sm" onClick={addNational} isLoading={createMany.isPending} className="self-start">
            <Wand2 size={14} aria-hidden />
            Add the national holidays for {year}
          </Button>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct). Festival dates change every year, so add those yourself.
          </p>
        </div>
      </form>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-display font-bold text-text">{year}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYear(y => y - 1)}
            aria-label="Previous year"
            className="flex items-center justify-center size-11 sm:size-9 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setYear(y => y + 1)}
            aria-label="Next year"
            className="flex items-center justify-center size-11 sm:size-9 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </div>

      {isPending && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 text-danger text-sm font-display">
          <span className="flex-1">We couldn't load the holidays.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && holidays.length === 0 && (
        <EmptyState icon={CalendarOff} title={`No holidays added for ${year}`} description="Add one above, or use the national holidays button." />
      )}

      {upcoming.length > 0 && (
        <section aria-label="Upcoming holidays" className="flex flex-col gap-2.5">
          <p className="text-xs font-display font-semibold text-text-secondary">Upcoming</p>
          <ul className="flex flex-col gap-2">
            {upcoming.map(h => <HolidayRow key={h.id} holiday={h} today={today} onDelete={handleDelete} busy={remove.isPending} />)}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section aria-label="Past holidays" className="flex flex-col gap-2.5">
          <p className="text-xs font-display font-semibold text-text-secondary">Past</p>
          <ul className="flex flex-col gap-2">
            {past.map(h => <HolidayRow key={h.id} holiday={h} today={today} onDelete={handleDelete} busy={remove.isPending} />)}
          </ul>
        </section>
      )}
    </div>
  );
};
