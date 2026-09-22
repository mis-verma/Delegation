export const LABEL_CLASS = 'text-xs font-display font-medium text-text-secondary flex items-center gap-1.5';

// Quiet, Notion-style group label — no bold weight, no icon-tint, no rule underneath. A property
// panel in Notion separates groups with whitespace and a small muted caption, not a loud heading;
// the icon+bold+divider treatment this replaced read as a page-level section header, which is too
// heavy for what's really just a label above a cluster of fields inside one modal.
export const SECTION_TITLE_CLASS = 'flex items-center gap-2 text-xs font-display font-semibold text-text-light';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Flat tag-pill treatment, same idea as a Notion "select" property: a soft tint fill communicates
// the pick, not a 2px outlined circle with a checkmark badge. Unselected stays plain muted text
// with no fill at all, so the one that's actually chosen is the only thing that visually pops.
export const PRIORITIES: { value: TicketPriority; label: string; short: string; outlineClass: string; selectedClass: string }[] = [
  { value: 'LOW', label: 'Low', short: 'L', outlineClass: 'text-text-muted hover:bg-surface-hover', selectedClass: 'bg-surface-active text-text-secondary' },
  { value: 'MEDIUM', label: 'Medium', short: 'M', outlineClass: 'text-warning/70 hover:bg-warning/5', selectedClass: 'bg-warning/15 text-warning' },
  { value: 'HIGH', label: 'High', short: 'H', outlineClass: 'text-danger/70 hover:bg-danger/5', selectedClass: 'bg-danger/15 text-danger' },
  { value: 'CRITICAL', label: 'Critical', short: 'C', outlineClass: 'text-danger/70 hover:bg-danger/5', selectedClass: 'bg-danger/25 text-danger font-bold' },
];
