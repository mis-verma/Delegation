import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';
import { Dropdown, type DropdownAction } from '../../components/dropdown';
// Same greeting logic HomePage's DashboardHeader already uses — one shared source instead of a
// second copy that could drift to a different morning/afternoon/evening boundary.
import { greeting } from '../dashboard/dashboardDisplay';
import { useIsMobile } from '../../lib/useMediaQuery';

// Matches DashboardHeader's own clock: cheap enough to tick on an interval without re-rendering
// the whole header every second, and 30s is plenty of precision for a minute-resolution display.
const CLOCK_REFRESH_MS = 30_000;

// size-11 (44px) — the minimum recommended touch target, not the size-9/size-8 this used to be;
// on a header full of icon-only buttons, undersized targets are the easiest spot to mis-tap on a
// phone.
//
// Deliberately doesn't include `inline-flex` here (every other utility in this string is safe to
// share) — two call sites below toggle their own display with `hidden`/responsive variants, and
// an unconditional `inline-flex` baked into this shared constant sits at the exact same
// specificity as `hidden`, so which one wins came down to Tailwind's internal generation order
// rather than source intent. In the built app `inline-flex` won regardless of viewport, so the
// desktop-only "Dashboard" link never actually hid on mobile — it stayed in the header and pushed
// the layout into horizontal overflow. Each call site now supplies its own `inline-flex` (or
// `hidden`/`sm:inline-flex` pair) so there's only ever one unconditional display utility in play.
const ICON_BUTTON =
  'items-center justify-center size-11 rounded-full text-text-muted ' +
  'transition-all duration-200 ease-out cursor-pointer ' +
  'hover:text-text hover:bg-surface-hover active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

interface AdminHeaderProps {
  onToggleSidebar: () => void;
  pageLabel: string;
}

// Admin's own header chrome — a light, neutral floating card (bg-surface + border, the same
// token-based treatment every other admin surface uses), not the bold navy gradient this used to
// carry. The sidebar still owns that navy "chrome" rail; the header no longer needs to match it —
// running two saturated navy bars stacked on top of each other read as busier and less
// professional than one calm surface under a colored rail. The sidebar already owns the brand
// mark, so this surfaces admin-specific context instead: which section you're in, right where a
// page title would otherwise go.
export const AdminHeader = ({ onToggleSidebar, pageLabel }: AdminHeaderProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const firstName = user?.name?.split(' ')[0];

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const currentDate = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const currentTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Phones: the theme toggle moves in here so the section title in the bar has room to show whole.
  const isMobile = useIsMobile();
  const accountActions: DropdownAction[] = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    ...(isMobile ? [{ label: theme === 'light' ? 'Dark mode' : 'Light mode', onClick: toggleTheme, icon: theme === 'light' ? Moon : Sun }] : []),
    { label: 'Settings', to: '/admin/settings', icon: Settings },
    { label: 'Sign out', onClick: logout, icon: LogOut, variant: 'destructive', separatorBefore: true },
  ];

  return (
    <header className="relative shrink-0 mx-3 mt-3 rounded-2xl bg-surface border border-border">
      <div className="flex items-center gap-3 sm:gap-4 h-16 px-3 sm:px-5">
        {/* Left: sidebar toggle + dynamic "you are here" title (the brand mark already lives in
            the sidebar, so this slot carries context instead of repeating it) */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            id="admin-sidebar-toggle"
            onClick={onToggleSidebar}
            className={`inline-flex ${ICON_BUTTON}`}
            title="Toggle navigation sidebar"
            aria-label="Toggle navigation sidebar"
          >
            <PanelLeft size={19} strokeWidth={2} />
          </button>

          {/* A standalone, always-visible way back to the regular user dashboard — it existed
              before only inside the account dropdown (still does, kept for muscle memory), which
              took two clicks to find rather than one. Text version from sm up only: below that,
              an icon-only copy of this plus the greeting plus the icon cluster on the right left
              the greeting with no room at all and forced it into a hard mid-word truncation
              ("Good aftern...") — the dropdown already carries this on mobile, so it's dropped
              there instead of duplicated. */}
          <Link
            to="/"
            className={`${ICON_BUTTON} w-auto gap-1.5 px-3 hidden sm:inline-flex`}
            title="Back to your dashboard"
          >
            <LayoutDashboard size={16} strokeWidth={2} />
            <span className="text-[13px] font-display font-semibold">Dashboard</span>
          </Link>

          <span className="hidden sm:block h-8 w-px bg-border shrink-0" aria-hidden="true" />

          {/* Phones: the section you're in, with today's date under it (same pattern as the main
              app header) — a greeting squeezed between the toggle and the icons only ever showed
              as "Good morn…". Desktop keeps the greeting with the section underneath. */}
          <div className="sm:hidden flex flex-col min-w-0 leading-tight">
            <span className="text-[15px] font-display font-bold text-text tracking-tight truncate">{pageLabel || 'Admin'}</span>
            <span className="text-[11px] font-medium text-text-muted">{currentDate}</span>
          </div>
          <div className="hidden sm:flex flex-col min-w-0 leading-tight">
            <span className="text-base font-display font-bold text-text truncate">
              {greeting()}{firstName ? `, ${firstName}` : null}
            </span>
            <span className="text-[11px] font-medium text-text-muted truncate">{pageLabel}</span>
          </div>
        </div>

        {/* Right: quick actions + account */}
        <div className="flex items-center gap-1 sm:gap-3 ml-auto shrink-0">
          {/* Live date/time — same pill treatment and tabular-nums convention as the main
              dashboard's DashboardHeader, just condensed to fit a 64px-tall bar. Hidden below `lg`:
              at that width the greeting is already fighting the icon cluster for room, and a
              stale-looking clock is worse than no clock. */}
          <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-hover border border-border text-xs font-medium text-text-secondary shrink-0">
            <span className="whitespace-nowrap">{currentDate}</span>
            <span className="size-1 rounded-full bg-border shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap tabular-nums">{currentTime}</span>
          </div>

          {/* gap-2 (8px), not gap-1 — the minimum spacing between two adjacent touch targets so a
              slightly-off tap on one doesn't land on the other. */}
          {/* Boxed pill from sm up; on phones the icons sit bare so the section title keeps its room. */}
          <div className="flex items-center gap-0.5 sm:gap-2 sm:p-1 rounded-full sm:bg-surface-hover sm:border sm:border-border">
            <NotificationBell badgeRing={false} />
            <button
              onClick={toggleTheme}
              className={`hidden sm:inline-flex ${ICON_BUTTON} overflow-hidden`}
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
                  <span className="relative flex items-center justify-center size-8 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-bold text-[11px] shrink-0 group-hover:scale-105 transition-transform">
                    {initials || <User size={14} strokeWidth={2.5} />}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface" aria-hidden="true" />
                  </span>
                  <span className="hidden lg:flex flex-col items-start min-w-0 leading-tight py-0.5">
                    <span className="max-w-[120px] truncate text-[13px] font-bold text-text">{user.name}</span>
                    {user.role && (
                      <span className="max-w-[120px] truncate text-[11px] font-medium text-text-muted mt-0.5">{titleCase(user.role)}</span>
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
