export type NavDirection = 'forward' | 'back' | 'tab';

export const TAB_PATHS: readonly string[] = ['/', '/tickets', '/tasks', '/todo', '/checklists'];

const NOT_DETAIL = new Set(['/checklists/approvals', '/checklists/history', '/checklists/weekly']);

const segments = (pathname: string) => pathname.split('/').filter(Boolean);

export const depthOf = (pathname: string) => (pathname === '/' ? 1 : segments(pathname).length);

export const directionBetween = (from: string, to: string): NavDirection => {
  const a = depthOf(from);
  const b = depthOf(to);
  return b > a ? 'forward' : b < a ? 'back' : 'tab';
};

export const isTabPath = (pathname: string) => TAB_PATHS.includes(pathname);

export const isRunDetailPath = (pathname: string) => /^\/checklists\/[^/]+$/.test(pathname) && !NOT_DETAIL.has(pathname);

export const hasBackArrow = (pathname: string) => segments(pathname).length > 1;

export const parentPath = (pathname: string) => {
  const parts = segments(pathname).slice(0, -1);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'admin')) return '/';
  return `/${parts.join('/')}`;
};

const memory = new Map<string, number>();

export const rememberScroll = (pathname: string, top: number) => {
  if (isTabPath(pathname)) memory.set(pathname, top);
};

export const recalledScroll = (pathname: string) => (isTabPath(pathname) ? memory.get(pathname) ?? 0 : 0);

export const SCROLL_TOP_EVENT = 'karya:scroll-top';
