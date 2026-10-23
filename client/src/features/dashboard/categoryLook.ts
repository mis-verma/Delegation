import { CheckSquare, ClipboardCheck, ListTodo, TicketCheck, type LucideIcon } from 'lucide-react';
import type { ActivityCategory } from './dashboardDisplay';

export const CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  checklist: ClipboardCheck,
  delegation: CheckSquare,
  ticket: TicketCheck,
  todo: ListTodo,
};

export const CATEGORY_TILE: Record<ActivityCategory, string> = {
  checklist: 'bg-linear-to-br from-primary-500 to-primary-600',
  delegation: 'bg-linear-to-br from-primary-500 to-primary-600',
  ticket: 'bg-linear-to-br from-primary-500 to-primary-600',
  todo: 'bg-linear-to-br from-primary-500 to-primary-600',
};

export const CATEGORY_PILL: Record<ActivityCategory, string> = {
  checklist: 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
  delegation: 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
  ticket: 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
  todo: 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
};
