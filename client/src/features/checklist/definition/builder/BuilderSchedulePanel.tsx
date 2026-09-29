import type { ReactNode } from 'react';
import { Store, Repeat, CalendarDays, Clock, AlertCircle, Moon, Check, Loader2 } from 'lucide-react';
import { DatePicker, TimePicker, WeekdayPicker, formatWeekdays } from '../../../../components';
import { useStoresQuery } from '../../../tickets/hook';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from '../../../tasks/taskFormFieldStyles';
import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDateStr = (v: string) => (v ? new Date(`${v}T00:00:00`) : null);

// Shared with ChecklistBuilder.tsx's `scheduleValid` gate. Only an EQUAL opens/cutoff time is a
// real problem — a genuinely zero-length window that can never be completed. A cutoff EARLIER
// than open time is not a mismatch: it's this app's real, supported overnight window (see
// checklistDisplay.ts's instanceDeadline — "opens 18:00, cutoff 07:00" is the documented example),
// which rolls the deadline to the next calendar day.
// eslint-disable-next-line react-refresh/only-export-components
export const hasScheduleTimeMismatch = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && opensTime === cutoffTime;

// True when cutoff-before-open means the window rolls past midnight into the next calendar day —
// purely informational (not a validation error, see hasScheduleTimeMismatch above).
// eslint-disable-next-line react-refresh/only-export-components
export const isOvernightWindow = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && cutoffTime < opensTime;

// eslint-disable-next-line react-refresh/only-export-components
export const RECURRENCE_OPTIONS: {
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

// One pill toggle — the same rounded-full chip language as the delegation / ticket forms'
// Details row, so picking stores and a cadence feels like picking a priority or a department.
const ToggleChip = ({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) => (
  <button
    type="button"
    aria-pressed={on}
    aria-label={label}
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-display font-semibold cursor-pointer select-none transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
      on
        ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-400 dark:text-primary-900'
        : 'border-border/70 bg-surface text-text-secondary hover:border-primary-400 hover:text-text'
    }`}
  >
    {children}
  </button>
);

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
  const { data: stores, isLoading: storesLoading } = useStoresQuery();
  const activeStores = (stores ?? []).filter((s) => s.isActive !== false);
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
          <button
            type="button"
            onClick={() => onStoreIdsChange(allSelected ? [] : activeStores.map((s) => s.id))}
            className="text-xs font-display font-semibold text-primary-700 dark:text-primary-300 cursor-pointer hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        )}
      >
        {storesLoading ? (
          <span className="flex items-center gap-2 text-xs font-display text-text-muted"><Loader2 size={13} className="animate-spin" /> Loading stores…</span>
        ) : activeStores.length === 0 ? (
          <span className="text-xs font-display text-text-muted">No stores yet — add one in People &amp; Teams.</span>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Stores that run this checklist">
            {activeStores.map((s) => {
              const on = storeIds.includes(s.id);
              return (
                <ToggleChip key={s.id} on={on} onClick={() => toggleStore(s.id)}>
                  {on ? <Check size={14} strokeWidth={2.75} /> : <Store size={14} className="text-text-light" />}
                  {s.name}
                </ToggleChip>
              );
            })}
          </div>
        )}
        {storeIds.length === 0 && !storesLoading && activeStores.length > 0 && (
          <p className="text-xs font-display text-text-muted">Pick at least one store.</p>
        )}
      </Section>

      <Section icon={Repeat} title="Repeats">
        <div role="radiogroup" aria-label="How often it repeats" className="flex flex-wrap gap-2">
          {RECURRENCE_OPTIONS.map((opt) => (
            <ToggleChip key={opt.value} on={recurrence === opt.value} onClick={() => onRecurrenceChange(opt.value)} label={`${opt.label} — ${opt.description}`}>
              {opt.label}
            </ToggleChip>
          ))}
        </div>
      </Section>

      {recurrence === 'DAILY' && (
        <Section icon={CalendarDays} title="Runs on" aside={<span className="text-xs font-display text-text-muted">{formatWeekdays(activeWeekdays)}</span>}>
          <WeekdayPicker value={activeWeekdays} onChange={onActiveWeekdaysChange} minSelected={1} aria-label="Days this checklist runs" />
          <p className="hidden sm:block text-xs font-display text-text-muted">
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
              placeholder={recurrence === 'ONE_TIME' ? 'Due date' : 'Start date'}
              triggerClassName={`${CHIP_TRIGGER_CLASS} h-9 text-[13px] ${startDate ? 'pr-10' : ''}`}
            />
          </div>
          <TimePicker
            popover
            prefix="Opens"
            value={opensTime}
            onChange={onOpensTimeChange}
            placeholder="any time"
            triggerClassName={`${CHIP_TRIGGER_CLASS} h-9 text-[13px]`}
          />
          <TimePicker
            popover
            prefix="Closes"
            value={cutoffTime}
            onChange={onCutoffTimeChange}
            placeholder="any time"
            triggerClassName={`${CHIP_TRIGGER_CLASS} h-9 text-[13px]`}
          />
        </div>
        {!startDate && <p className="text-xs font-display text-text-muted">Pick a start date to continue.</p>}
        {hasTimeMismatch ? (
          <p className="flex items-center gap-1.5 text-xs font-display font-medium text-danger">
            <AlertCircle size={13} className="shrink-0" />
            Opening and closing can’t be the same time.
          </p>
        ) : isOvernight ? (
          <p className="flex items-center gap-1.5 text-xs font-display text-text-secondary">
            <Moon size={13} className="shrink-0 text-text-light" />
            Overnight — closes at {cutoffTime} the next morning.
          </p>
        ) : null}
      </Section>
    </div>
  );
};
