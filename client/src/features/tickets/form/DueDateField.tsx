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

export const DueDateField = ({ due, onDueChange, canSetStart = false, start = null, onStartChange, invalid = false, id }: DueDateFieldProps) => {
  const withStart = canSetStart && !!onStartChange;

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
        placeholder={withStart ? 'Choose start and end' : 'Choose a due day'}
      />
    </div>
  );
};
