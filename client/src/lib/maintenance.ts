import { useQuery } from '@tanstack/react-query';
import { settingApi } from '../api/settings';

/**
 * Maintenance mode: build-time whole-app, build-time per-page, and runtime whole-app.
 *
 * `VITE_MAINTENANCE_MODE=true` takes the entire app down (the pre-existing behaviour, kept as-is).
 * `VITE_MAINTENANCE_PAGES` takes down individual pages instead, so a single module can be put
 * behind a maintenance notice while it's being updated without blocking everything else:
 *
 *   VITE_MAINTENANCE_PAGES=/tasks,/checklists
 *
 * Both are Vite env vars, read at build time — flipping one needs a rebuild/redeploy. That's a
 * deliberate trade for those two: no backend endpoint, zero runtime cost.
 *
 * `usePublicSettingsQuery` below is the server-driven third option this comment used to invite
 * adding: an ADMIN flips it from Admin → Settings with no redeploy, for planned downtime that
 * isn't a code deploy. See App.tsx's ProtectedRoute for where it gates the app. The same query
 * also carries org branding (name/logo) now — one public settings poll, several consumers.
 */

const parsePages = (raw: string): string[] =>
  raw
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean)
    // Normalise "tasks" and "/tasks/" both to "/tasks" so the env var is forgiving about slashes.
    .map((path) => `/${path.replace(/^\/+|\/+$/g, '')}`);

export const MAINTENANCE_ALL = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

export const MAINTENANCE_PAGES = parsePages(import.meta.env.VITE_MAINTENANCE_PAGES ?? '');

/**
 * Matches the page and everything under it — `/tasks` also covers `/tasks/team`, since a module
 * being rebuilt usually means its detail routes are mid-change too. `/` is special-cased to match
 * the dashboard exactly, or it would swallow every route in the app.
 */
export const isPathUnderMaintenance = (pathname: string): boolean =>
  MAINTENANCE_PAGES.some((page) => (page === '/' ? pathname === '/' : pathname === page || pathname.startsWith(`${page}/`)));

/** Human-readable page name for the notice, derived from the path when we have nothing better. */
export const maintenancePageLabel = (pathname: string): string => {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return 'This page';
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Polled (not just fetched once) so a maintenance window turning on or off shows up for people
// already sitting in the app, not only on their next hard reload. Runs for signed-out visitors
// too (the /settings/status endpoint needs no auth) — needed there anyway, since the login screen
// renders the org name/logo from this same query.
export const usePublicSettingsQuery = () =>
  useQuery({
    queryKey: ['public-settings'],
    queryFn: () => settingApi.status().then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
