import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { NavLink, useLocation } from 'react-router';
import {
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
// Same greeting the Admin header and the Dashboard use, so the three never disagree on where morning ends.
import { greeting as timeGreeting } from '../../features/dashboard/dashboardDisplay';

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
  // Phones: the header carries the page's name (or a greeting on Home) with today's date under it,
  // since the desktop page-label pill and clock don't fit there.
  const firstName = (user?.name ?? '').split(' ')[0];
  const isHome = location.pathname === '/';
  const phoneTitle = isHome ? timeGreeting(now) : pageLabel;
  const phoneDateOnly = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  // Home: the name rides on the second line so "Good afternoon" fits a 360px bar uncut.
  const phoneDate = isHome && firstName ? `${firstName} · ${phoneDateOnly}` : phoneDateOnly;

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
    // The same floating card as the Admin header: a flat surface with a border and rounded corners,
    // not the old full-bleed glass bar with a shadow and a gradient underline. The one difference is
    // that this one keeps the logo (the Admin header leaves the brand to its sidebar; here the logo
    // is the way home and the only brand mark on screen).
    <header className="relative z-30 shrink-0 mx-3 mt-3 rounded-2xl bg-surface border border-border">
      <div className="flex items-center gap-3 sm:gap-4 h-16 px-3 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`${ICON_BUTTON_CLASS} md:hidden -ml-1.5`}
              aria-label="Open menu"
            >
              <Menu size={18} strokeWidth={2} />
            </button>
          )}

          <NavLink
            viewTransition
            to="/"
            title="Home"
            className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-xl shrink-0"
          >
            {customLogoSrc ? (
              // An org's own uploaded logo has no guaranteed visual weight of its own (unlike
              // BrandLogo's self-contained tile below), so it sits in a quiet tinted frame.
              <span className="flex items-center justify-center size-9 sm:size-10 rounded-xl bg-primary-500/10 border border-primary-500/20 transition-transform duration-200 group-hover:scale-105">
                <img src={customLogoSrc} alt={orgName} className="h-6 w-auto object-contain" />
              </span>
            ) : (
              <span className="inline-flex rounded-xl transition-transform duration-200 group-hover:scale-105">
                {/* The mark alone on a phone; from sm up the name sits beside it, so the logo reads as a logo on
                    tablets and desktops instead of a small blue square. */}
                <BrandLogo className="size-10 sm:size-11" textClassName="hidden sm:inline-flex text-lg" />
              </span>
            )}
          </NavLink>

          <span className="hidden sm:block h-8 w-px bg-border shrink-0" aria-hidden="true" />

          {/* Phones: the page (or a greeting on Home) with today's date under it. */}
          {phoneTitle && (
            <div className="sm:hidden flex flex-col min-w-0 leading-tight">
              <span className="text-base font-display font-bold text-text tracking-tight truncate">{phoneTitle}</span>
              <span className="text-xs font-medium text-text-muted truncate">{phoneDate}</span>
            </div>
          )}

          {/* From sm up, same two lines as the Admin header: the greeting, with the section under it. */}
          <div className="hidden sm:flex flex-col min-w-0 leading-tight">
            <span className="text-base font-display font-bold text-text truncate">
              {timeGreeting(now)}{firstName ? `, ${firstName}` : null}
            </span>
            {pageLabel && <span className="text-xs font-medium text-text-muted truncate">{pageLabel}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-3 ml-auto shrink-0">
          {/* Live date and time, same pill as the Admin header. */}
          <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-hover border border-border text-xs font-medium text-text-secondary shrink-0">
            <span className="whitespace-nowrap">{currentDate}</span>
            <span className="size-1 rounded-full bg-border shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap tabular-nums">{currentTime}</span>
          </div>

          {/* Boxed pill from sm up; on phones the icons sit bare so the page title keeps its room. */}
          <div className="flex items-center gap-0.5 sm:gap-2 sm:p-1 rounded-full sm:bg-surface-hover sm:border sm:border-border">
            {user && <NotificationBell badgeRing={false} />}
            <button
              onClick={toggleTheme}
              className={`${ICON_BUTTON_CLASS} overflow-hidden`}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle visual theme"
            >
              <span className={`inline-flex transition-transform duration-500 ${theme === 'light' ? 'rotate-0' : 'rotate-180'}`}>
                {theme === 'light' ? <Moon size={16} strokeWidth={2} /> : <Sun size={16} strokeWidth={2} />}
              </span>
            </button>
          </div>

          {user && (
            <Dropdown
              items={accountActions}
              trigger={
                <button
                  title={user.name}
                  aria-label={`Account menu, ${user.name}${user.role ? `, ${titleCase(user.role)}` : ''}`}
                  className="flex items-center gap-2.5 h-11 px-1.5 sm:pl-1 sm:pr-3 rounded-full sm:bg-surface-hover sm:border sm:border-border text-text-secondary cursor-pointer transition-all duration-200 hover:bg-surface-active hover:text-text active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 group"
                >
                  <span className="relative flex items-center justify-center size-8 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                    {initials || <User size={14} strokeWidth={2.5} />}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface" aria-hidden="true" />
                  </span>
                  <span className="hidden lg:flex flex-col items-start min-w-0 leading-tight py-0.5">
                    <span className="max-w-[120px] truncate text-sm font-bold text-text">{user.name}</span>
                    {user.role && (
                      <span className="max-w-[120px] truncate text-xs font-medium text-text-muted mt-0.5">{titleCase(user.role)}</span>
                    )}
                  </span>
                  <ChevronDown size={14} className="hidden sm:inline text-text-light shrink-0 ml-1 group-hover:text-text-muted transition-colors" strokeWidth={2.5} />
                </button>
              }
            />
          )}
        </div>
      </div>
    </header>
  );
};
