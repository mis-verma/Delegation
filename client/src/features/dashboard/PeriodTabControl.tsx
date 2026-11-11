import { useMemo } from 'react';
import { SlidingTabs } from '../../components/slidingTabs';

interface PeriodTabControlProps<T extends string> {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  className?: string;
  fill?: boolean;
  columns?: boolean;
  dense?: boolean;
}

export function PeriodTabControl<T extends string>({ value, options, labels, onChange, className, fill, columns }: PeriodTabControlProps<T>) {
  const items = useMemo(() => options.map((option) => ({ value: option, label: labels[option] })), [options, labels]);
  return <SlidingTabs label="View" value={value} options={items} onChange={onChange} size="sm" fill={fill || columns} className={className} />;
}
