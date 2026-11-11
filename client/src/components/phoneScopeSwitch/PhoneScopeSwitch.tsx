import type { LucideIcon } from 'lucide-react';
import { SlidingTabs } from '../slidingTabs';

interface PhoneScopeSwitchProps<T extends string> {
  options: Array<{ value: T; label: string; shortLabel?: string; icon?: LucideIcon }>;
  value: T;
  allValue: T;
  onChange: (next: T) => void;
}

export const PhoneScopeSwitch = <T extends string>({ options, value, allValue, onChange }: PhoneScopeSwitchProps<T>) => (
  <SlidingTabs
    label="Show"
    pressed
    fill="phone"
    size="sm"
    className="min-w-0 flex-1 sm:w-auto sm:flex-none sm:shrink-0"
    value={value}
    options={options}
    onChange={(next) => onChange(next === value ? allValue : next)}
  />
);
