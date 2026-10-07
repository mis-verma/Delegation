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
      <TabsList className={`rounded-full bg-surface-hover/60 border-border/40 ${fill ? 'h-9 w-full sm:w-auto' : 'h-12'} sm:h-9 p-0.5 sm:p-1 gap-0.5`}>
        {options.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className={`h-full ${fill ? 'relative min-h-0 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""] data-[state=active]:bg-primary-500/15 data-[state=active]:shadow-none data-[state=active]:ring-0 sm:after:hidden sm:data-[state=active]:bg-surface sm:data-[state=active]:ring-1' : 'min-h-11'} sm:min-h-0 rounded-full ${fill ? 'flex-1 min-w-0 truncate px-1 font-medium data-[state=active]:font-semibold tracking-normal sm:flex-none sm:px-3.5 sm:font-bold sm:data-[state=active]:font-bold sm:tracking-wide' : 'px-3 font-medium data-[state=active]:font-semibold tracking-normal sm:px-3.5 sm:font-bold sm:data-[state=active]:font-bold sm:tracking-wide'} text-xs sm:text-xs font-display data-[state=active]:ring-1 data-[state=active]:ring-border/60 data-[state=active]:text-primary-600 dark:data-[state=active]:text-primary-400`}
          >
            {labels[option]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
