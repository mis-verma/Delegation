import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { DateRangePicker, type DateRangeValue } from '../dateRangePicker';
import type { useCreatedRange } from '../../lib/createdRange';

type CreatedRangeState = ReturnType<typeof useCreatedRange>;

interface CreatedRangePickerProps {
  createdRange: CreatedRangeState;
  className?: string;
  label?: string;
}

export const CreatedRangePicker = ({ createdRange, className, label = 'Created on' }: CreatedRangePickerProps) => {
  const { range, set, clear } = createdRange;
  const value = useMemo<DateRangeValue>(
    () => (range ? { from: new Date(range.from), to: new Date(range.to - 1) } : { from: null, to: null }),
    [range],
  );

  const handleChange = (next: DateRangeValue) => {
    if (next.from && next.to) set(next.from, next.to);
    else if (!next.from && !next.to) clear();
  };

  return (
    <DateRangePicker
      value={value}
      onChange={handleChange}
      placeholder={label}
      placeholderIsValue
      className={className}
      triggerClassName={cn(
        'h-9 min-h-9 py-0 rounded-lg whitespace-nowrap pointer-coarse:h-11 pointer-coarse:min-h-11',
        range ? 'pl-1' : 'w-auto px-1 [&>span:nth-child(2)]:sr-only',
      )}
    />
  );
};
