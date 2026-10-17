import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DateRangePicker, type DateRangeValue } from '../../../components';
import { QuickDueOptions } from './QuickDueOptions';

interface DueDateFieldProps {
  due: Date | null;
  onDueChange: (due: Date | null) => void;
  canSetStart?: boolean;
  start?: Date | null;
  onStartChange?: (start: Date | null) => void;
  invalid?: boolean;
  id?: string;
}

const LINK_CLASS =
  'relative self-start -ml-2 inline-flex items-center gap-1.5 h-8 pointer-coarse:h-11 px-2 rounded-md t-meta font-display font-semibold text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

export const DueDateField = ({ due, onDueChange, canSetStart = false, start = null, onStartChange, invalid = false, id }: DueDateFieldProps) => {
  const [showStart, setShowStart] = useState(!!start);
  const withStart = canSetStart && !!onStartChange && showStart;

  const pickDue = (next: Date | null) => {
    onDueChange(next);
    if (next && start && start.getTime() > next.getTime()) onStartChange?.(null);
  };

  const pickRange = (range: DateRangeValue) => {
    if (!range.from && !range.to) {
      onDueChange(null);
      onStartChange?.(null);
      return;
    }
    if (withStart) onStartChange?.(range.from);
    pickDue(range.to);
  };

  return (
    <div id={id} className="flex flex-col gap-2 min-w-0">
      <QuickDueOptions value={due} onPick={pickDue} />
      <DateRangePicker
        tiles
        showTime
        hidePresets
        dueOnly={!withStart}
        value={{ from: withStart ? start : null, to: due }}
        onChange={pickRange}
        minDate={new Date()}
        invalid={invalid}
        placeholder={withStart ? 'Pick the start and the due day' : 'Pick a due day and time'}
      />
      {canSetStart && onStartChange && (
        <button
          type="button"
          onClick={() => {
            if (showStart) onStartChange(null);
            setShowStart((v) => !v);
          }}
          className={LINK_CLASS}
        >
          {showStart ? <X size={14} strokeWidth={2.5} aria-hidden /> : <Plus size={14} strokeWidth={2.5} aria-hidden />}
          {showStart ? 'Remove start day' : 'Add start day and time'}
        </button>
      )}
    </div>
  );
};
