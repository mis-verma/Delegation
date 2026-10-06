import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PeriodTabControlProps<T extends string> {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  className?: string;
  /** Tighter tabs that share the width equally, for rows with five or more options on a phone. */
  fill?: boolean;
}

// One period-tab look for the whole Dashboard — ActivityGroupByControl, CompareDashboard, and
// MonthlyTargetCard each used to hand-roll their own version of "a row of Day/Week/Month/Year
// buttons" with different radii, active-states, and even different underlying markup. Generic
// over the option type so ActivityGroupBy (day/month/quarter/year) and CompliancePeriod
// (day/week/month/year) — two different value sets — both render through this one component.
//
// Touch: the list is 48px tall below `sm` so each tab (list height minus its 2px padding) is a
// real 44px target; from `sm` up it drops back to the compact 36px desktop control.
export function PeriodTabControl<T extends string>({ value, options, labels, onChange, className, fill }: PeriodTabControlProps<T>) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList className={`rounded-full bg-surface-hover/60 border-border/40 h-12 sm:h-9 p-0.5 sm:p-1 gap-0.5${fill ? ' w-full sm:w-auto' : ''}`}>
        {options.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className={`h-full min-h-11 sm:min-h-0 rounded-full ${fill ? 'flex-1 px-1.5 sm:flex-none sm:px-3.5' : 'px-4 sm:px-3.5'} text-xs sm:text-xs font-display font-bold tracking-wide data-[state=active]:ring-1 data-[state=active]:ring-border/60 data-[state=active]:text-primary-600 dark:data-[state=active]:text-primary-400`}
          >
            {labels[option]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
