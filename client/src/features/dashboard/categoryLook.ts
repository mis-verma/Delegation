import { CheckSquare, ClipboardCheck, ListTodo, TicketCheck, type LucideIcon } from 'lucide-react';
import type { ActivityCategory } from './dashboardDisplay';

export const CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  checklist: ClipboardCheck,
  delegation: CheckSquare,
  ticket: TicketCheck,
  todo: ListTodo,
};

export const CATEGORY_TILE: Record<ActivityCategory, string> = {
  checklist: 'bg-linear-to-br from-vivid-blue to-vivid-blue/70',
  delegation: 'bg-linear-to-br from-vivid-green to-vivid-green/70',
  ticket: 'bg-linear-to-br from-vivid-sky to-vivid-sky/70',
  todo: 'bg-linear-to-br from-text-muted to-text-secondary',
};

export const CATEGORY_PILL: Record<ActivityCategory, string> = {
  checklist: 'bg-vivid-blue/12 text-vivid-blue-text',
  delegation: 'bg-vivid-green/12 text-vivid-green-text',
  ticket: 'bg-vivid-sky/12 text-vivid-sky-text',
  todo: 'bg-surface-hover text-text-secondary',
};

export const CATEGORY_ACCENT: Record<ActivityCategory, string> = {
  checklist: 'bg-vivid-blue',
  delegation: 'bg-vivid-green',
  ticket: 'bg-vivid-sky',
  todo: 'bg-text-muted',
};
