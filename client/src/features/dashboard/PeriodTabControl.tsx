import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList
        className={cn('h-auto', columns ? 'grid w-full flex-nowrap' : fill ? 'flex w-full' : 'w-fit')}
        style={columns ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className={columns ? 'min-h-11 sm:min-h-8 min-w-0 px-1 text-xs' : 'min-h-11 sm:min-h-9 basis-auto px-3 text-xs sm:text-sm'}
          >
            {labels[option]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
