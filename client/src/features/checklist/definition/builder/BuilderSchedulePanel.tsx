import { canOfferLateWindow, hasScheduleTimeMismatch, isOvernightWindow, lateWindowProblem } from './scheduleWindow';
import { earlySentence, repeatSentence, startDateHint, windowSentence } from './scheduleSummary';
import { useMemo, type ReactNode } from 'react';
import {
  Store, Repeat, CalendarDays, CalendarRange, CalendarClock, CalendarCheck, Target, Sun, Clock, AlertCircle, Moon, Check, Sunrise, Sunset, Hourglass, Eye, type LucideIcon,
} from 'lucide-react';
import { Button, DatePicker, InlineError, Skeleton, TimePicker, ToggleChip, WeekdayPicker, formatWeekdays } from '../../../../components';
import { cn } from '@/lib/utils';
import { useStoresQuery } from '../../hook';
import { WindowTimeline } from './WindowTimeline';
import { BuilderField as Field, BuilderSection as Section } from './BuilderSection';
import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDateStr = (v: string) => (v ? new Date(`${v}T00:00:00`) : null);

const RECURRENCE_OPTIONS: {
  value: ChecklistRecurrence;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { value: 'DAILY', label: 'Daily', description: 'Every day, or the days you pick', icon: Sun },
  { value: 'WEEKLY', label: 'Weekly', description: 'Same weekday every week', icon: CalendarRange },
  { value: 'MONTHLY', label: 'Monthly', description: 'Same date every month', icon: CalendarDays },
  { value: 'QUARTERLY', label: 'Quarterly', description: 'Every 3 months', icon: CalendarClock },
  { value: 'YEARLY', label: 'Yearly', description: 'Once a year', icon: Repeat },
  { value: 'ONE_TIME', label: 'One-time', description: 'A single run', icon: Target },
];

const QUICK_WINDOWS: { label: string; opens: string; closes: string; late: string; icon: LucideIcon }[] = [
  { label: 'All day', opens: '', closes: '', late: '', icon: Sun },
  { label: 'Morning 9 AM to 1 PM', opens: '09:00', closes: '13:00', late: '', icon: Sunrise },
  { label: 'Store hours 9:30 AM to 6:30 PM', opens: '09:30', closes: '18:30', late: '21:00', icon: Clock },
  { label: 'Evening 6 PM to 11:59 PM', opens: '18:00', closes: '23:59', late: '', icon: Sunset },
  { label: 'Overnight 10 PM to 6 AM', opens: '22:00', closes: '06:00', late: '', icon: Moon },
];

interface BuilderSchedulePanelProps {
  storeIds: string[];
  onStoreIdsChange: (ids: string[]) => void;
  recurrence: ChecklistRecurrence;
  onRecurrenceChange: (value: ChecklistRecurrence) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  opensTime: string;
  onOpensTimeChange: (value: string) => void;
  cutoffTime: string;
  onCutoffTimeChange: (value: string) => void;
  lateUntilTime: string;
  onLateUntilTimeChange: (value: string) => void;
  activeWeekdays: number[];
  onActiveWeekdaysChange: (days: number[]) => void;
  className?: string;
}

const Note = ({ tone, icon: Icon, children }: { tone: 'muted' | 'danger'; icon?: LucideIcon; children: ReactNode }) => (
  <p className={cn('flex items-start gap-1.5 t-meta font-display', tone === 'danger' ? 'font-medium text-danger' : 'text-text-muted')}>
    {Icon && <Icon size={13} className="mt-0.5 shrink-0" aria-hidden="true" />}
    <span className="min-w-0">{children}</span>
  </p>
);

const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const BuilderSchedulePanel = ({
  storeIds,
  onStoreIdsChange,
  recurrence,
  onRecurrenceChange,
  startDate,
  onStartDateChange,
  opensTime,
  onOpensTimeChange,
  cutoffTime,
  onCutoffTimeChange,
  lateUntilTime,
  onLateUntilTimeChange,
  activeWeekdays,
  onActiveWeekdaysChange,
  className = '',
}: BuilderSchedulePanelProps) => {
  const { data: stores, isPending: storesPending, isError: storesError, refetch: refetchStores } = useStoresQuery();
  const activeStores = useMemo(() => (stores ?? []).filter((s) => s.isActive !== false), [stores]);
  const chipStores = useMemo(() => {
    const known = new Set((stores ?? []).map((s) => s.id));
    const inactivePicked = (stores ?? []).filter((s) => s.isActive === false && storeIds.includes(s.id));
    const removedPicked = stores ? storeIds.filter((id) => !known.has(id)) : [];
    return [
      ...activeStores.map((s) => ({ id: s.id, name: s.name, note: '' })),
      ...inactivePicked.map((s) => ({ id: s.id, name: s.name, note: 'inactive' })),
      ...removedPicked.map((id) => ({ id, name: 'Removed store', note: 'removed' })),
    ];
  }, [stores, activeStores, storeIds]);
  const hasTimeMismatch = hasScheduleTimeMismatch(opensTime, cutoffTime);
  const isOvernight = isOvernightWindow(opensTime, cutoffTime);
  const offerLate = canOfferLateWindow(recurrence, opensTime, cutoffTime);
  const lateProblem = lateWindowProblem(recurrence, opensTime, cutoffTime, lateUntilTime);
  const isOneTime = recurrence === 'ONE_TIME';
  const early = earlySentence(recurrence);

  const toggleStore = (id: string) =>
    onStoreIdsChange(storeIds.includes(id) ? storeIds.filter((s) => s !== id) : [...storeIds, id]);
  const allSelected = activeStores.length > 0 && activeStores.every((s) => storeIds.includes(s.id));

  return (
    <div className={`flex flex-col gap-4 sm:gap-5 ${className}`}>
      <Section
        icon={Store}
        title="Stores"
        hint="Every store you pick gets its own run of this checklist."
        aside={activeStores.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStoreIdsChange(allSelected ? [] : activeStores.map((s) => s.id))}
            className="shrink-0 text-primary-700 dark:text-primary-300 pointer-coarse:min-h-11"
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
        )}
      >
        {storesPending ? (
          <div className="flex flex-wrap gap-2" aria-busy="true">
            {['w-28', 'w-36', 'w-24', 'w-32'].map((w, i) => <Skeleton key={i} className={`min-h-11 sm:min-h-8 rounded-full ${w}`} />)}
          </div>
        ) : storesError ? (
          <InlineError message="We couldn't load the stores." onRetry={() => refetchStores()} />
        ) : chipStores.length === 0 ? (
          <span className="t-meta font-display text-text-muted">No stores yet. Add one in People &amp; Teams.</span>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Stores that run this checklist">
            {chipStores.map((s) => {
              const on = storeIds.includes(s.id);
              return (
                <ToggleChip key={s.id} on={on} onClick={() => toggleStore(s.id)}>
                  {on ? <Check size={14} strokeWidth={2.75} /> : <Store size={14} className="text-text-light" />}
                  {s.name}
                  {s.note && <span className="font-normal text-text-muted">({s.note})</span>}
                </ToggleChip>
              );
            })}
          </div>
        )}
        {storeIds.length === 0 && !storesPending && !storesError && activeStores.length > 0 && (
          <Note tone="muted">Pick at least one store.</Note>
        )}
      </Section>

      <Section icon={Repeat} title="Repeats" hint="How often a new run is created.">
        <div role="radiogroup" aria-label="How often it repeats" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RECURRENCE_OPTIONS.map((opt) => {
            const on = recurrence === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onRecurrenceChange(opt.value)}
                className={cn(
                  'relative flex min-h-24 cursor-pointer flex-col items-start gap-2.5 rounded-xl border p-3 text-left outline-none transition-colors duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  on ? 'border-primary-500/60 bg-primary-500/8' : 'border-border/60 bg-surface hover:border-border-hover',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl',
                    on ? 'bg-linear-to-br from-primary-500 to-primary-700 text-white' : 'bg-surface-hover text-text-secondary',
                  )}
                  aria-hidden="true"
                >
                  <opt.icon size={17} strokeWidth={2.25} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="t-card font-display font-bold text-text">{opt.label}</span>
                  <span className="t-meta text-text-muted">{opt.description}</span>
                </span>
                {on && (
                  <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary-600 text-white" aria-hidden="true">
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {recurrence === 'DAILY' && (
        <Section
          icon={CalendarDays}
          title="Runs on"
          hint="Leave a weekday off and no checklist is created that day."
          aside={<span className="shrink-0 rounded-full border border-border/60 bg-surface px-2.5 py-1 t-meta font-display font-semibold text-text-secondary">{formatWeekdays(activeWeekdays)}</span>}
        >
          <WeekdayPicker value={activeWeekdays} onChange={onActiveWeekdaysChange} minSelected={1} aria-label="Days this checklist runs" />
          <p className="hidden sm:block t-meta font-display text-text-muted">
            People’s own week-off days are skipped too.
          </p>
        </Section>
      )}

      <Section icon={Clock} title={isOneTime ? 'When' : 'Starts & open hours'} hint="Pick a start date, then set when staff can fill it in.">
        <div className="flex flex-col gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">Quick windows</span>
          <div role="group" aria-label="Quick time windows" className="flex flex-wrap gap-1.5">
            {QUICK_WINDOWS.map((w) => {
              const wantedLate = recurrence === 'DAILY' ? w.late : '';
              const on = opensTime === w.opens && cutoffTime === w.closes && (lateUntilTime === wantedLate || (wantedLate === '' && !offerLate));
              return (
                <ToggleChip
                  key={w.label}
                  on={on}
                  onClick={() => { onOpensTimeChange(w.opens); onCutoffTimeChange(w.closes); onLateUntilTimeChange(wantedLate); }}
                >
                  {on ? <Check size={14} strokeWidth={2.75} /> : <w.icon size={14} className="text-text-light" />}
                  {w.label}
                </ToggleChip>
              );
            })}
          </div>
        </div>

        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', offerLate ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          <Field label={isOneTime ? 'Due date' : 'Start date'} hint={startDateHint(recurrence, startDate)}>
            <DatePicker
              value={parseDateStr(startDate)}
              onChange={(d) => onStartDateChange(d ? toDateStr(d) : '')}
              minDate={isOneTime ? startOfToday() : undefined}
              placeholder={isOneTime ? 'Pick the due date' : 'Pick a start date'}
              className="w-full"
              triggerClassName="w-full"
            />
          </Field>
          <Field label="Opens">
            <TimePicker popover value={opensTime} onChange={onOpensTimeChange} placeholder="Any time" />
          </Field>
          <Field label="Closes">
            <TimePicker popover value={cutoffTime} onChange={onCutoffTimeChange} placeholder="Any time" />
          </Field>
          {offerLate && (
            <Field label="Late until">
              <TimePicker popover value={lateUntilTime} onChange={onLateUntilTimeChange} placeholder="None" />
            </Field>
          )}
        </div>

        {!hasTimeMismatch && <WindowTimeline opensTime={opensTime} cutoffTime={cutoffTime} lateUntilTime={offerLate ? lateUntilTime : ''} />}
        {offerLate && !lateUntilTime && (
          <Note tone="muted" icon={Hourglass}>
            Optional: staff who miss the closing time can still fill it in until the late time. It counts as filled late.
          </Note>
        )}
        {offerLate && lateUntilTime && !lateProblem && (
          <Note tone="muted" icon={Hourglass}>
            After {cutoffTime} staff see a red reminder and can fill it in until {lateUntilTime}. It counts as filled late.
          </Note>
        )}
        {lateProblem && <Note tone="danger" icon={AlertCircle}>{lateProblem}</Note>}
        {!startDate && <Note tone="muted">Pick a start date to continue.</Note>}
        {hasTimeMismatch ? (
          <Note tone="danger" icon={AlertCircle}>Opening and closing can’t be the same time.</Note>
        ) : isOvernight ? (
          <Note tone="muted" icon={Moon}>Overnight: closes at {cutoffTime} the next morning.</Note>
        ) : null}
      </Section>

      <section aria-label="Schedule summary" className="rounded-2xl border border-primary-500/25 bg-linear-to-br from-primary-500/[0.08] to-primary-500/[0.02] p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <CalendarCheck size={18} strokeWidth={2.25} />
          </span>
          <span className="t-card font-display font-bold text-text">How it will run</span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          <li className="flex items-start gap-2 t-card font-display font-semibold text-text">
            <Repeat size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            {repeatSentence(recurrence, startDate, formatWeekdays(activeWeekdays))}
          </li>
          <li className="flex items-start gap-2 t-card font-display font-medium text-text-secondary">
            <Clock size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            {windowSentence(opensTime, cutoffTime, isOvernight)}
          </li>
          <li className="flex items-start gap-2 t-card font-display font-medium text-text-secondary">
            <Store size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            {storeIds.length === 0 ? 'No store picked yet' : `${storeIds.length} ${storeIds.length === 1 ? 'store' : 'stores'}, one run each`}
          </li>
          {early && (
            <li className="flex items-start gap-2 t-card font-display font-medium text-text-secondary">
              <Eye size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              {early}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};
