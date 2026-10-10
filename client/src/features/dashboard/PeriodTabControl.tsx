import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface PeriodTabControlProps<T extends string> {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  className?: string;
  /** Take the full width of the row, the options sharing it equally. */
  fill?: boolean;
  /**
   * One row of equal columns that never wraps, with smaller type: for a narrow side panel where a
   * wrapped row would leave one option alone on a second line. Keep the labels short there.
   */
  columns?: boolean;
  /** Kept so existing callers compile; every tab row now has the same size. */
  dense?: boolean;
}

/**
 * The app's one segmented tab row (period, scope, measure, view). Same look as every other Tabs row: the
 * picked option is a solid blue pill. Labels are never cut: options size to their words, share the row
 * when it is wide, and wrap to a second line when it is not, instead of spilling out of the pill.
 */
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
