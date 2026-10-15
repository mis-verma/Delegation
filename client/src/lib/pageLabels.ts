// The name the top bar shows for the page you are on (Header.tsx), kept in one place so PageHeader can tell when
// the top bar already says it. Order matters: `.find()` takes the first match, so a specific route comes before
// the generic one that would also match it.
const PAGE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/$/, label: 'Dashboard' },
  // Checked before the generic /tasks pattern below — this route needs its own name rather than the plain "Delegation".
  { pattern: /^\/tasks\/smart/, label: 'Smart Delegations' },
  { pattern: /^\/tasks/, label: 'Delegation' },
  { pattern: /^\/tickets/, label: 'Tickets' },
  { pattern: /^\/todo/, label: 'To-Do' },
  { pattern: /^\/events/, label: 'Events' },
  { pattern: /^\/checklists/, label: 'Checklists' },
  { pattern: /^\/projects/, label: 'Projects' },
  { pattern: /^\/calendar/, label: 'Calendar' },
  { pattern: /^\/settings/, label: 'Settings' },
  { pattern: /^\/analytics/, label: 'Analytics' },
  { pattern: /^\/verify/, label: 'Verification Queue' },
  { pattern: /^\/team/, label: 'Team Overview' },
  { pattern: /^\/admin\/(scores|data-check)/, label: 'Scores' },
  { pattern: /^\/admin/, label: 'Admin' },
];

export const getPageLabel = (pathname: string): string | undefined => PAGE_LABELS.find((p) => p.pattern.test(pathname))?.label;
