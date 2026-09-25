import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { NavLink, useLocation } from 'react-router';
import {
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { Dropdown, type DropdownAction } from '../dropdown';
import { BrandLogo } from '../brandLogo';
import { usePublicSettingsQuery } from '../../lib/maintenance';
import { resolveLogoUrl } from '../../lib/uploadsBase';

// size-11 (44px) — the minimum recommended touch target, not the size-9/size-8 this used to be.
// Matches the same fix already applied to AdminHeader's icon buttons, for the same reason: on a
// header full of icon-only buttons, undersized targets are the easiest spot to mis-tap on a phone.
export const ICON_BUTTON_CLASS =
  'inline-flex items-center justify-center size-11 rounded-full text-text-muted ' +
  'transition-all duration-200 ease-out cursor-pointer ' +
  'hover:text-text hover:bg-surface-hover hover:border-border-hover border border-transparent ' +
  'active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const PAGE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/$/, label: 'Dashboard' },
  // Checked before the generic /tasks pattern below — .find() takes the first match, and this
  // route needs its own breadcrumb rather than inheriting the plain "Delegation" one.
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
  { pattern: /^\/admin/, label: 'Admin' },
];

const getPageLabel = (pathname: string) => PAGE_LABELS.find((p) => p.pattern.test(pathname))?.label;

// 30s is plenty of precision for a minute-resolution display, and cheap enough to tick without
// re-rendering the whole header every second. Matches AdminHeader's own clock.
const CLOCK_REFRESH_MS = 30_000;

export const Header = ({ onToggleSidebar }: { onToggleSidebar?: () => void }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const pageLabel = user ? getPageLabel(location.pathname) : undefined;

  const { data: publicSettings } = usePublicSettingsQuery();
  const orgName = publicSettings?.orgName ?? 'Karya';
  const customLogoSrc = resolveLogoUrl(publicSettings?.logoUrl);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const currentDate = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const currentTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const accountActions: DropdownAction[] = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Settings', to: '/settings', icon: Settings },
    {
      label: 'Sign out',
      onClick: logout,
      icon: LogOut,
      variant: 'destructive',
      separatorBefore: true,
    },
  ];

  return (
    <header
      // `sticky` alone already gives the gradient accent line below a containing block to
      // position against, same as `relative` would — no need for both (and no risk of the two
      // position utilities racing each other in the compiled stylesheet).
      className="sticky top-0 z-50 w-full bg-surface/80 dark:bg-background/80 backdrop-blur-md transition-colors shadow-[0_1px_24px_-6px_rgba(15,34,64,0.18)] dark:shadow-[0_1px_24px_-4px_rgba(0,0,0,0.55)]"
      style={{
        backdropFilter: 'var(--glass-blur, blur(12px))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(12px))'
      }}
    >
      {/* Signature accent line instead of a flat border — the same navy-to-gold pairing as the
          brand mark, so the one persistent element on every screen carries the brand's own colors
          rather than a neutral gray rule. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary-600/0 via-primary-500 to-coral-500 dark:from-primary-400/0 dark:via-primary-400 dark:to-coral-400"
      />
      {/* No max-width cap here on purpose — a top bar spans the full width of its own container
          (viewport minus the sidebar), same as any nav bar. The page CONTENT below still caps at
          --container-width for readability on an ultra-wide monitor; the header isn't reading
          material, so capping it too just left two big matching empty gutters on a wide screen
          for no reason. */}
      <div className="px-3 sm:px-5">
        <div className="h-(--header-height) flex items-center gap-3 sm:gap-4">

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">

            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className={`${ICON_BUTTON_CLASS} md:hidden -ml-1.5`}
                aria-label="Open menu"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
            )}

            <NavLink
              to="/"
              className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-xl shrink-0"
            >
              {customLogoSrc ? (
                // An org's own uploaded logo has no guaranteed visual weight of its own (unlike
                // BrandLogo's self-contained tile below), so it still gets the same quiet
                // navy/gold-tinted frame the default mark used to lean on.
                <span className="flex items-center justify-center size-11 rounded-xl bg-gradient-to-br from-primary-50 to-coral-500/10 dark:from-primary-500/15 dark:to-coral-500/10 border border-primary-100 dark:border-primary-500/30 transition-transform duration-300 group-hover:scale-105">
                  <img src={customLogoSrc} alt={orgName} className="h-6 w-auto object-contain" />
                </span>
              ) : (
                <span className="inline-flex rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_0_6px_rgba(66,106,159,0.16)] dark:group-hover:shadow-[0_0_0_6px_rgba(97,138,189,0.22)]">
                  <BrandLogo className="size-11" showWordmark={false} />
                </span>
              )}
            </NavLink>

            {pageLabel && (
              <>
                <span className="hidden sm:block h-5 w-px bg-border shrink-0" aria-hidden="true" />
                {/* text-overflow: ellipsis never renders on a flex container's own text content —
                    the truncation has to live on a nested block-level span (with min-w-0 so it can
                    actually shrink inside the flex parent), or long labels ("Team Overview",
                    "Verification Queue") hard-clip mid-letter with no "…" at this pill's width. */}
                {/* hidden below sm — at phone widths (~360-428px) this pill was the difference
                    between the account menu button fitting on screen or being pushed past the
                    viewport edge and silently clipped by the shell's overflow-hidden (no scrollbar
                    ever appeared, so there was no visible sign the button was unreachable). The
                    current section is still visible in the page content itself and in BottomNav's
                    active tab, so this is genuinely redundant on the width where it doesn't fit. */}
                <span className="hidden sm:inline-flex items-center rounded-full bg-primary-50/80 dark:bg-primary-900/20 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-primary-700 dark:text-primary-300 ring-1 ring-border dark:ring-primary-800/50 max-w-[5.5rem] sm:max-w-[9rem] lg:max-w-none">
                  <span className="min-w-0 truncate">{pageLabel}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 ml-auto">

            {/* Live date/time — every other page besides the Dashboard itself had no ambient sense
                of "when" in the persistent chrome (the greeting+clock on DashboardHeader only
                renders on '/'). Same pill treatment and tabular-nums convention as AdminHeader's
                clock; hidden below `lg` so it doesn't compete with the page-label pill on narrower
                screens. */}
            <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-hover border border-border text-xs font-medium text-text-secondary shrink-0">
              {/* A live-clock pill telling the time is itself the "this is ticking right now"
                  signal — a small pulsing dot makes that legible at a glance instead of only on
                  close reading, the same "live" cue a status/monitoring dashboard would use. */}
              <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-success" />
              </span>
              <CalendarDays size={13} className="text-primary-600 dark:text-primary-400 shrink-0" strokeWidth={2.25} />
              <span className="whitespace-nowrap">{currentDate}</span>
              <span className="size-1 rounded-full bg-border shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap tabular-nums">{currentTime}</span>
            </div>

            {/* One toolbar instead of a separate bell+theme pill and a separate account pill —
                the account trigger folds in as just its avatar; the name/role text it used to
                carry is already shown persistently in the sidebar, so dropping it from here isn't
                losing that information, just not repeating it. gap-1 (not gap-2): the divider
                between the icon group and the account avatar already provides the visual
                separation a wider gap was doing on its own. Bell stays the same plain neutral
                icon every other button in this toolbar uses — a blurred amber glow behind it
                read as a fuzzy yellow smudge, not a considered accent, and a resting bell doesn't
                need its own color at all; the red unread badge already says "there's something
                here" when it matters. */}
            <div className="flex items-center gap-1 p-1 rounded-full border border-border bg-surface-hover/30">
              {user && <NotificationBell />}

              <button
                onClick={toggleTheme}
                className={`${ICON_BUTTON_CLASS} overflow-hidden ${theme === 'light' ? 'text-primary-600 hover:bg-primary-500/10' : 'text-coral-500 hover:bg-coral-500/10'}`}
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                aria-label="Toggle visual theme"
              >
                <span
                  className={`inline-flex transition-transform duration-500 ${
                    theme === 'light' ? 'rotate-0' : 'rotate-180'
                  }`}
                >
                  {theme === 'light' ? <Moon size={16} strokeWidth={2} /> : <Sun size={16} strokeWidth={2} />}
                </span>
              </button>

              {user && (
                <>
                  <span className="w-px h-5 bg-border shrink-0" aria-hidden="true" />
                  <Dropdown
                    items={accountActions}
                    trigger={
                      <button
                        title={user.name}
                        aria-label={`Account menu — ${user.name}${user.role ? `, ${titleCase(user.role)}` : ''}`}
                        className="flex items-center gap-1 h-11 pl-1 pr-2 rounded-full text-text-secondary cursor-pointer transition-all duration-200 hover:bg-surface-hover active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 group"
                      >
                        <span className="relative flex items-center justify-center size-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 ring-1 ring-inset ring-white/15 text-white font-bold text-[11px] shrink-0 group-hover:scale-105 transition-transform">
                          {initials || <User size={14} strokeWidth={2.5} />}
                          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface" aria-hidden="true" />
                        </span>
                        <ChevronDown size={13} className="hidden sm:inline text-text-muted shrink-0 group-hover:text-text transition-colors" strokeWidth={2.5} />
                      </button>
                    }
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};