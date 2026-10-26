import { memo, useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { NavLink, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
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
import { useIsMobile } from '../../lib/useMediaQuery';
import { getPageLabel } from '../../lib/pageLabels';
import { cn } from '@/lib/utils';
import { haptic } from '../../lib/haptics';
import { hasBackArrow, parentPath } from '../../lib/appNav';
import { greeting as timeGreeting } from '../../features/dashboard/dashboardDisplay';

const ICON_BUTTON_CLASS =
  'inline-flex items-center justify-center size-10 pointer-coarse:size-11 rounded-xl text-text-muted ' +
  'transition-all duration-200 ease-out cursor-pointer ' +
  'hover:text-text hover:bg-surface-hover hover:border-border-hover border border-transparent ' +
  'active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const CLOCK_REFRESH_MS = 30_000;

const HeaderImpl = ({ onToggleSidebar }: { onToggleSidebar?: () => void }) => {
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
  const firstName = (user?.name ?? '').split(' ')[0];
  const isHome = location.pathname === '/';
  const navigate = useNavigate();
  const showBack = hasBackArrow(location.pathname);
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(parentPath(location.pathname), { replace: true });
  };
  const phoneTitle = isHome ? timeGreeting(now) : pageLabel;
  const phoneDateOnly = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const phoneDate = isHome && firstName ? `${firstName}, ${phoneDateOnly}` : phoneDateOnly;

  const isMobile = useIsMobile();
  const accountActions: DropdownAction[] = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    ...(isMobile ? [{ label: theme === 'light' ? 'Dark mode' : 'Light mode', onClick: toggleTheme, icon: theme === 'light' ? Moon : Sun }] : []),
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
    <header className={`relative shrink-0 mx-3 mt-3 rounded-xl border border-border/70 bg-surface bg-linear-to-r from-primary-500/[0.06] via-surface to-surface dark:from-primary-400/[0.09] z-30`}>
      <div className="flex items-center gap-2 sm:gap-4 h-14 sm:h-16 px-3 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={() => { haptic('tap'); goBack(); }}
              className={cn(ICON_BUTTON_CLASS, 'md:hidden -ml-1 border-border/60 bg-surface-hover/50')}
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
          )}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={cn(ICON_BUTTON_CLASS, 'md:hidden -ml-1 border-border/60 bg-surface-hover/50', showBack && 'max-md:hidden')}
              aria-label="Open menu"
            >
              <Menu size={18} strokeWidth={2} />
            </button>
          )}

          <NavLink
            viewTransition
            to="/"
            title="Home"
            className={`group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-xl shrink-0 ${phoneTitle ? 'max-sm:hidden' : ''}`}
          >
            {customLogoSrc ? (
              <span className="flex items-center justify-center size-9 sm:size-10 rounded-xl bg-primary-500/10 border border-primary-500/20">
                <img src={customLogoSrc} alt={orgName} className="h-6 w-auto object-contain" />
              </span>
            ) : (
              <span className="inline-flex rounded-xl">
                <BrandLogo className="size-8 sm:size-9" textClassName="hidden sm:inline-flex text-xl" />
              </span>
            )}
          </NavLink>

          <span className="hidden sm:block h-7 w-px shrink-0 bg-border/70" aria-hidden="true" />

          {phoneTitle && (
            <div className="sm:hidden flex flex-col min-w-0 leading-tight">
              <span className="t-card font-display font-bold text-text tracking-tight truncate">{phoneTitle}</span>
              <span className="t-meta font-medium text-text-muted truncate">{phoneDate}</span>
            </div>
          )}

          <div className="hidden sm:flex flex-col min-w-0 leading-tight">
            <span className="t-card font-display font-bold text-text truncate">
              {pageLabel ?? `${timeGreeting(now)}${firstName ? `, ${firstName}` : ''}`}
            </span>
            <span className="t-meta font-medium text-text-muted truncate">
              {pageLabel ? `${timeGreeting(now)}${firstName ? `, ${firstName}` : ''} · ${currentDate}` : currentDate}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-3 ml-auto shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {user && <NotificationBell badgeRing={false} />}
            <button
              onClick={toggleTheme}
              className={cn(ICON_BUTTON_CLASS, 'hidden sm:inline-flex overflow-hidden', 'border-border/60 bg-surface-hover/50 text-text-secondary hover:bg-surface-hover hover:text-text')}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle visual theme"
            >
              <span className={`inline-flex transition-transform duration-500 ${theme === 'light' ? 'rotate-0' : 'rotate-180'}`}>
                {theme === 'light' ? <Moon size={16} strokeWidth={2} /> : <Sun size={16} strokeWidth={2} />}
              </span>
            </button>
          </div>

          {user && <span className="hidden sm:block h-7 w-px shrink-0 bg-border/70" aria-hidden="true" />}

          {user && (
            <Dropdown
              title="Account"
              items={accountActions}
              trigger={
                <button
                  title={user.name}
                  aria-label={`Account menu, ${user.name}${user.role ? `, ${titleCase(user.role)}` : ''}`}
                  className="flex items-center gap-2.5 h-11 px-1.5 sm:pl-1 sm:pr-2.5 rounded-full sm:border sm:border-border/60 sm:bg-surface-hover/40 text-text-secondary cursor-pointer transition-colors duration-200 hover:bg-surface-hover sm:hover:border-border-hover hover:text-text active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 group"
                >
                  <span className="relative flex items-center justify-center size-8 rounded-full bg-linear-to-br from-primary-500 to-primary-700 text-white font-display font-bold t-meta shrink-0 ring-2 ring-surface">
                    {initials || <User size={14} strokeWidth={2.5} />}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface" aria-hidden="true" />
                  </span>
                  <span className="hidden lg:flex flex-col items-start min-w-0 leading-tight py-0.5">
                    <span className="max-w-[120px] truncate t-meta font-display font-bold text-text">{user.name}</span>
                    {user.role && (
                      <span className="max-w-[120px] truncate t-meta font-medium text-text-muted">{titleCase(user.role)}</span>
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

export const Header = memo(HeaderImpl);
