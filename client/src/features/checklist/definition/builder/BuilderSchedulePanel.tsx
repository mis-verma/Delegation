import {
  Store,
  Calendar,
  Clock,
  Repeat,
  CalendarClock,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StoreMultiSelect, DatePicker, TimePicker } from '../../../../components';
import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDateStr = (v: string) => (v ? new Date(`${v}T00:00:00`) : null);

// Shared with ChecklistBuilder.tsx's `scheduleValid` gate. Only an EQUAL opens/cutoff time is a
// real problem — a genuinely zero-length window that can never be completed. A cutoff EARLIER
// than open time is not a mismatch: it's this app's real, supported overnight window (see
// checklistDisplay.ts's instanceDeadline — "opens 18:00, cutoff 07:00" is the documented example),
// which rolls the deadline to the next calendar day. This used to also flag that case as a
// blocking error, which meant the builder could never actually create the schedule its own
// backend was built to support.
// eslint-disable-next-line react-refresh/only-export-components
export const hasScheduleTimeMismatch = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && opensTime === cutoffTime;

// True when cutoff-before-open means the window rolls past midnight into the next calendar day —
// purely informational (not a validation error, see hasScheduleTimeMismatch above).
// eslint-disable-next-line react-refresh/only-export-components
export const isOvernightWindow = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && cutoffTime < opensTime;

// Colocated with the component like ui/badge.tsx's own badgeVariants export — only affects Fast
// Refresh granularity (a full reload instead of a hot-swap when this file changes), not runtime
// correctness.
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
  className?: string;
}

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
  className = '',
}: BuilderSchedulePanelProps) => {
  const hasTimeMismatch = hasScheduleTimeMismatch(opensTime, cutoffTime);
  const isOvernight = isOvernightWindow(opensTime, cutoffTime);

  return (
    <div
      className={`flex flex-col gap-6 p-5 rounded-xl border border-border bg-surface shadow-xs transition-all duration-200 ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-muted/60 text-text-secondary">
            <CalendarClock size={15} />
          </span>
          <div>
            <h3 className="text-xs font-display font-bold text-text">
              Schedule & Location
            </h3>
            <p className="text-[11px] font-display text-text-muted">
              Specify participating stores, recurrence, and execution times
            </p>
          </div>
        </div>

        <Badge variant={storeIds.length > 0 ? 'info' : 'outline'} className="text-[11px] py-0.5">
          {storeIds.length === 0
            ? 'No stores selected'
            : `${storeIds.length} store${storeIds.length === 1 ? '' : 's'}`}
        </Badge>
      </div>

      {/* 1. Target Stores Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-display font-semibold text-text flex items-center gap-1.5">
          <Store size={13} className="text-text-muted" />
          Target Stores <span className="text-danger">*</span>
        </label>
        <StoreMultiSelect selected={storeIds} onChange={onStoreIdsChange} />
        {storeIds.length === 0 && (
          <p className="text-[11px] font-display text-warning flex items-center gap-1">
            <Info size={12} className="shrink-0" />
            Please select at least one store location for this checklist.
          </p>
        )}
      </div>

      {/* 2. Recurrence Frequency */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-dashed border-border/60">
        <label className="text-xs font-display font-semibold text-text flex items-center gap-1.5">
          <Repeat size={13} className="text-text-muted" />
          Recurrence Frequency <span className="text-danger">*</span>
        </label>

        <div
          role="radiogroup"
          aria-label="Select recurrence frequency"
          className="flex flex-wrap gap-2"
        >
          {RECURRENCE_OPTIONS.map((opt) => {
            const isSelected = recurrence === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onRecurrenceChange(opt.value)}
                title={opt.description}
                className={[
                  'px-3.5 py-1.5 rounded-lg text-xs font-display font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                  isSelected
                    ? 'bg-primary-700 text-white shadow-xs'
                    : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover hover:text-text hover:border-border/80',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Effective Dates & Daily Availability Window */}
      <div className="flex flex-col gap-4 pt-2 border-t border-dashed border-border/60">
        {/* Start / Due Date */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-display font-semibold text-text px-1">
            <Calendar size={13} className="text-text-muted" />
            {recurrence === 'ONE_TIME' ? 'Due Date' : 'Effective Start Date'} <span className="text-danger">*</span>
          </label>
          <DatePicker
            value={parseDateStr(startDate)}
            onChange={(d) => onStartDateChange(d ? toDateStr(d) : '')}
            placeholder="Select a date"
            triggerClassName="h-12 rounded-lg px-4"
          />
          <p className="text-[11px] font-display text-text-muted px-1">
            {recurrence === 'ONE_TIME'
              ? 'Date when this single checklist must be completed.'
              : 'The checklist will activate and begin repeating from this date onwards.'}
          </p>
        </div>

        {/* Daily Time Window */}
        <div className="space-y-1.5">
          <label className="text-xs font-display font-semibold text-text flex items-center gap-1.5">
            <Clock size={13} className="text-text-muted" />
            Daily Active Hours (Optional)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-display font-semibold text-text-muted px-1">
                Available From (Opens)
              </label>
              <TimePicker
                value={opensTime}
                onChange={onOpensTimeChange}
                placeholder="Any time"
                triggerClassName="h-12 rounded-lg px-4"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-display font-semibold text-text-muted px-1">
                Cut-off By (Closes)
              </label>
              <TimePicker
                value={cutoffTime}
                onChange={onCutoffTimeChange}
                placeholder="Any time"
                triggerClassName="h-12 rounded-lg px-4"
              />
            </div>
          </div>

          {hasTimeMismatch ? (
            <p className="text-[11px] font-display text-warning flex items-center gap-1 mt-1">
              <AlertCircle size={12} className="shrink-0" />
              Open and cut-off can't be the same time — there'd be no time to complete it.
            </p>
          ) : isOvernight ? (
            <p className="text-[11px] font-display text-primary-600 dark:text-primary-400 flex items-center gap-1 mt-1">
              <Info size={12} className="shrink-0" />
              Overnight window — cuts off at {cutoffTime} the next morning, not the same day.
            </p>
          ) : (
            <p className="text-[11px] font-display text-text-muted">
              Leave blank if the checklist can be completed at any hour of the day.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};