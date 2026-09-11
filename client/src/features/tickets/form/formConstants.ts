export const LABEL_CLASS = 'text-xs font-display font-medium text-text-secondary flex items-center gap-1.5';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const PRIORITIES: { value: TicketPriority; label: string; short: string; outlineClass: string; selectedClass: string }[] = [
  { value: 'LOW', label: 'Low', short: 'L', outlineClass: 'border-border text-text-secondary', selectedClass: 'bg-surface-hover border-border-hover text-text' },
  { value: 'MEDIUM', label: 'Medium', short: 'M', outlineClass: 'border-warning/60 text-warning', selectedClass: 'bg-warning/10 border-warning text-warning' },
  { value: 'HIGH', label: 'High', short: 'H', outlineClass: 'border-danger/60 text-danger', selectedClass: 'bg-danger/10 border-danger text-danger' },
  { value: 'CRITICAL', label: 'Critical', short: 'C', outlineClass: 'border-danger/60 text-danger font-bold', selectedClass: 'bg-danger/10 border-danger text-danger font-bold' },
];
