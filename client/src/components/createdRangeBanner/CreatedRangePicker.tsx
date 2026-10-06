import { useState } from 'react';
import { DateRangePicker, type DateRangeValue } from '../dateRangePicker';
import type { useCreatedRange } from '../../lib/createdRange';

type CreatedRangeState = ReturnType<typeof useCreatedRange>;

interface CreatedRangePickerProps {
  createdRange: CreatedRangeState;
  className?: string;
}

/**
 * "Created on" calendar for a list page. Pick a start day and an end day (the same day twice is one
 * day); the list narrows to items created in it and the banner above the page says so. It is the same
 * filter a chart bar links to, so the two always agree.
 *
 * The first tap alone is kept in a local draft, because the calendar needs to see "start chosen, end
 * not yet" to know the next tap is the end. Only a complete range is written to the address.
 */
export const CreatedRangePicker = ({ createdRange, className }: CreatedRangePickerProps) => {
  const { range, set } = createdRange;
  const [draft, setDraft] = useState<DateRangeValue | null>(null);

  const applied: DateRangeValue = range
    ? { from: new Date(range.from), to: new Date(range.to - 1) }
    : { from: null, to: null };

  const handleChange = (next: DateRangeValue) => {
    if (next.from && next.to) {
      setDraft(null);
      set(next.from, next.to);
    } else {
      setDraft(next);
    }
  };

  return (
    <DateRangePicker
      value={draft ?? applied}
      onChange={handleChange}
      placeholder="Created on"
      className={className ?? 'w-full sm:w-48'}
      triggerClassName="h-9 rounded-lg px-3 text-sm"
    />
  );
};
