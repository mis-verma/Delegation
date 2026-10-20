import { useMemo, type ReactNode } from 'react';
import { Store, Repeat, CalendarDays, Clock, AlertCircle, Moon, Check } from 'lucide-react';
import { Button, DatePicker, InlineError, Skeleton, TimePicker, ToggleChip, WeekdayPicker, formatWeekdays } from '../../../../components';
import { useStoresQuery } from '../../hook';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from '../../../tasks/taskFormFieldStyles';
import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDateStr = (v: string) => (v ? new Date(`${v}T00:00:00`) : null);

// eslint-disable-next-line react-refresh/only-export-components
export const hasScheduleTimeMismatch = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && opensTime === cutoffTime;

// eslint-disable-next-line react-refresh/only-export-components
export const isOvernightWindow = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && cutoffTime < opensTime;

const RECURRENCE_OPTIONS: {
  value: ChecklistRecurrence;
  label: string;
  description: string;
}[] = [
  { value: 'DAILY', label: 'Daily', description: 'Repeats every day' },
  { value: 'WEEKLY', label: 'Weekly', description: 'Repeats once a week' },
  { value: 'MONTHLY', label: 'Monthly', description: 'Repeats monthly' },
  { value: 'QUARTERLY', label: 'Quarterly', description: 'Repeats every 3 months' },
  { value: 'YEARLY', label: 'Yearly', description: 'Repeats once a year' },
  { value: 'ONE_TIME', label: 'One-time', description: 'Single occurrence' },
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
  activeWeekdays: number[];
  onActiveWeekdaysChange: (days: number[]) => void;
  className?: string;
}

const Section = ({ icon: Icon, title, aside, children }: { icon: typeof Store; title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-2.5">
    <div className="flex items-center justify-between gap-2">
      <span className={DETAIL_HEADING_CLASS}>
        <Icon size={14} className="text-text-light" />
        {title}
      </span>
      {aside}
    </div>
    {children}
  </section>
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

  const toggleStore = (id: string) =>
    onStoreIdsChange(storeIds.includes(id) ? storeIds.filter((s) => s !== id) : [...storeIds, id]);
  const allSelected = activeStores.length > 0 && activeStores.every((s) => storeIds.includes(s.id));

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <Section
        icon={Store}
        title="Stores"
        aside={activeStores.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStoreIdsChange(allSelected ? [] : activeStores.map((s) => s.id))}
            className="text-primary-700 dark:text-primary-300"
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
          <p className="t-meta font-display text-text-muted">Pick at least one store.</p>
        )}
      </Section>

      <Section icon={Repeat} title="Repeats">
        <div role="group" aria-label="How often it repeats" className="flex flex-wrap gap-2">
          {RECURRENCE_OPTIONS.map((opt) => (
            <ToggleChip key={opt.value} on={recurrence === opt.value} onClick={() => onRecurrenceChange(opt.value)}>
              {opt.label}
              <span className="sr-only">: {opt.description}</span>
            </ToggleChip>
          ))}
        </div>
      </Section>

      {recurrence === 'DAILY' && (
        <Section icon={CalendarDays} title="Runs on" aside={<span className="t-meta font-display text-text-muted">{formatWeekdays(activeWeekdays)}</span>}>
          <WeekdayPicker value={activeWeekdays} onChange={onActiveWeekdaysChange} minSelected={1} aria-label="Days this checklist runs" />
          <p className="hidden sm:block t-meta font-display text-text-muted">
            No checklist on the days left off. People’s own week-off days are skipped too.
          </p>
        </Section>
      )}

      <Section icon={Clock} title={recurrence === 'ONE_TIME' ? 'When' : 'Starts & open hours'}>
        <div className="flex flex-wrap items-center gap-2">
          <div title={recurrence === 'ONE_TIME' ? 'Due date' : 'Starts on'}>
            <DatePicker
              value={parseDateStr(startDate)}
              onChange={(d) => onStartDateChange(d ? toDateStr(d) : '')}
              minDate={recurrence === 'ONE_TIME' ? startOfToday() : undefined}
              placeholder={recurrence === 'ONE_TIME' ? 'Due date' : 'Start date'}
              triggerClassName={`${CHIP_TRIGGER_CLASS} h-11 sm:h-9 text-sm ${startDate ? 'pr-10' : ''}`}
            />
          </div>
          <TimePicker
            popover
            prefix="Opens"
            value={opensTime}
            onChange={onOpensTimeChange}
            placeholder="any time"
            triggerClassName={`${CHIP_TRIGGER_CLASS} h-11 sm:h-9 text-sm`}
          />
          <TimePicker
            popover
            prefix="Closes"
            value={cutoffTime}
            onChange={onCutoffTimeChange}
            placeholder="any time"
            triggerClassName={`${CHIP_TRIGGER_CLASS} h-11 sm:h-9 text-sm`}
          />
        </div>
        {!startDate && <p className="t-meta font-display text-text-muted">Pick a start date to continue.</p>}
        {hasTimeMismatch ? (
          <p className="flex items-center gap-1.5 t-meta font-display font-medium text-danger">
            <AlertCircle size={13} className="shrink-0" />
            Opening and closing can’t be the same time.
          </p>
        ) : isOvernight ? (
          <p className="flex items-center gap-1.5 t-meta font-display text-text-secondary">
            <Moon size={13} className="shrink-0 text-text-light" />
            Overnight: closes at {cutoffTime} the next morning.
          </p>
        ) : null}
      </Section>
    </div>
  );
};
