const PAGE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/$/, label: 'Dashboard' },
  { pattern: /^\/tasks\/smart/, label: 'Smart Delegations' },
  { pattern: /^\/tasks/, label: 'Delegation' },
  { pattern: /^\/tickets/, label: 'Tickets' },
  { pattern: /^\/todo/, label: 'To-Do' },
  { pattern: /^\/events/, label: 'Events' },
  { pattern: /^\/checklists/, label: 'Checklists' },
  { pattern: /^\/projects/, label: 'Projects' },
  { pattern: /^\/leave/, label: 'Leave' },
  { pattern: /^\/calendar/, label: 'Calendar' },
  { pattern: /^\/settings/, label: 'Settings' },
  { pattern: /^\/analytics/, label: 'Analytics' },
  { pattern: /^\/verify/, label: 'Verification Queue' },
  { pattern: /^\/team\/fill/, label: 'Fill chart' },
  { pattern: /^\/team/, label: 'Team Overview' },
  { pattern: /^\/admin\/(scores|data-check)/, label: 'Scores' },
  { pattern: /^\/admin/, label: 'Admin' },
];

export const getPageLabel = (pathname: string): string | undefined => PAGE_LABELS.find((p) => p.pattern.test(pathname))?.label;
