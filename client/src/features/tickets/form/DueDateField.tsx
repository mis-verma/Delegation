import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DatePicker } from '../../../components';
import { QuickDueOptions } from './QuickDueOptions';
import { FIELD_TRIGGER_CLASS } from './formConstants';

interface DueDateFieldProps {
  /** The due moment (date and time), or null when none is picked yet. */
  due: Date | null;
  onDueChange: (due: Date | null) => void;
  /** Managers and up may also give the first day of work. Off for everyone else. */
  canSetStart?: boolean;
  start?: Date | null;
  onStartChange?: (start: Date | null) => void;
  /** Red border on the picker while its error shows. */
  invalid?: boolean;
  /** Id for the due picker's wrapper, so a failed save can scroll to it. */
  id?: string;
}

const LINK_BASE =
  'relative inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-xs font-display font-semibold text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-y-1.5 after:inset-x-0';
const LINK_CLASS = `${LINK_BASE} self-start -ml-2`;

/**
 * One due date and time for a ticket, the same control in the New ticket form and the edit form:
 * the quick chips (each due at 6 PM), then one picker for an exact day and time. The picker's own
 * quick row is switched off so the same choices aren't offered twice. Managers and up get an
 * "Add start day" link for the first day of work; it is optional and only informational.
 */
export const DueDateField = ({ due, onDueChange, canSetStart = false, start = null, onStartChange, invalid = false, id }: DueDateFieldProps) => {
  // Shown once asked for, or straight away when the ticket already has one.
  const [showStart, setShowStart] = useState(!!start);

  const pickDue = (next: Date | null) => {
    onDueChange(next);
    // A start day after the new due day can't be right, so it is dropped.
    if (next && start && start.getTime() > next.getTime()) onStartChange?.(null);
  };

  return (
    <div id={id} className="flex flex-col gap-2 min-w-0">
      <QuickDueOptions value={due} onPick={pickDue} />
      <DatePicker
        value={due}
        onChange={pickDue}
        showTime
        hideQuickPicks
        defaultHour={18}
        minDate={new Date()}
        placeholder="Pick a due date and time"
        triggerClassName={`${FIELD_TRIGGER_CLASS} ${invalid ? 'border-danger/60' : ''}`}
      />

      {canSetStart && onStartChange && (
        showStart ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="t-meta font-display font-semibold text-text-secondary">Start day (optional)</span>
              <button
                type="button"
                onClick={() => { onStartChange(null); setShowStart(false); }}
                className={`${LINK_BASE} -mr-2`}
              >
                <X size={14} strokeWidth={2.5} aria-hidden />
                Remove
              </button>
            </div>
            <DatePicker
              value={start}
              onChange={onStartChange}
              placeholder="Pick the first day of work"
              triggerClassName={FIELD_TRIGGER_CLASS}
            />
          </div>
        ) : (
          <button type="button" onClick={() => setShowStart(true)} className={LINK_CLASS}>
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            Add start day
          </button>
        )
      )}
    </div>
  );
};
