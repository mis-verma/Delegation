
import type { LucideIcon } from 'lucide-react';

export interface FilterOption<T> {
  value: T;
  label: string;
  dotClassName?: string;
  icon?: LucideIcon;
}

export interface FilterPerson {
  id: string;
  name: string;
}
