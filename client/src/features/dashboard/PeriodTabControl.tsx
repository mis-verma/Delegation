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
  /** Kept so existing callers compile; every tab row now has the same size. */
  dense?: boolean;
}

/**
 * The app's one segmented tab row (period, scope, measure, view). Same look as every other Tabs row: the
 * picked option is a solid blue pill. Labels are never cut: options size to their words, share the row
 * when it is wide, and wrap to a second line when it is not, instead of spilling out of the pill.
 */
export function PeriodTabControl<T extends string>({ value, options, labels, onChange, className, fill }: PeriodTabControlProps<T>) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList className={cn('h-auto', fill ? 'flex w-full' : 'w-fit')}>
        {options.map((option) => (
          <TabsTrigger key={option} value={option} className="min-h-11 sm:min-h-9 basis-auto px-3 text-xs sm:text-sm">
            {labels[option]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
