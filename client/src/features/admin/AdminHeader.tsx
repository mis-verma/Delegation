import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronDown,
  Eye,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';
import { ViewAsPicker } from '../viewAs/ViewAsPicker';
import { Dropdown, type DropdownAction } from '../../components/dropdown';
import { greeting } from '../dashboard/dashboardDisplay';
import { useIsMobile } from '../../lib/useMediaQuery';
import { ROLE_META } from './roleBadge';
import { cn } from '@/lib/utils';
import type { Role } from '../../api/auth';

const CLOCK_REFRESH_MS = 30_000;

const ICON_BUTTON =
  'items-center justify-center size-10 pointer-coarse:size-11 rounded-xl text-text-muted ' +
  'transition-all duration-200 ease-out cursor-pointer ' +
  'hover:text-text hover:bg-surface-hover active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

const roleLabel = (role: Role) => ROLE_META[role]?.label ?? role;

interface AdminHeaderProps {
  onToggleSidebar: () => void;
  pageLabel: string;
}

export const AdminHeader = ({ onToggleSidebar, pageLabel }: AdminHeaderProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, realUser } = useAuth();
  const [picking, setPicking] = useState(false);

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

  const isMobile = useIsMobile();
  const accountActions: DropdownAction[] = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    ...(isMobile ? [{ label: theme === 'light' ? 'Dark mode' : 'Light mode', onClick: toggleTheme, icon: theme === 'light' ? Moon : Sun }] : []),
    { label: 'Settings', to: '/admin/settings', icon: Settings },
    { label: 'Sign out', onClick: logout, icon: LogOut, variant: 'destructive', separatorBefore: true },
  ];

  return (
    <header className="brand-surface relative shrink-0 mx-3 mt-3 rounded-xl border border-white/15">
      <div className="flex items-center gap-3 sm:gap-4 h-16 px-3 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            id="admin-sidebar-toggle"
            onClick={onToggleSidebar}
            className={cn('inline-flex', ICON_BUTTON, 'border border-border/60 bg-surface-hover/50')}
            title="Toggle navigation sidebar"
            aria-label="Toggle navigation sidebar"
          >
            <PanelLeft size={19} strokeWidth={2} />
          </button>

          <Link
            to="/"
            className={`${ICON_BUTTON} w-auto gap-1.5 px-3 hidden sm:inline-flex`}
            title="Back to your dashboard"
          >
            <LayoutDashboard size={16} strokeWidth={2} />
            <span className="text-sm font-display font-semibold">Dashboard</span>
          </Link>

          <span className="hidden sm:block h-7 w-px shrink-0 bg-border/70" aria-hidden="true" />

          <div className="sm:hidden flex flex-col min-w-0 leading-tight">
            <span className="t-card font-display font-bold text-text tracking-tight truncate">{pageLabel || 'Admin'}</span>
            <span className="t-meta font-medium text-text-muted">{currentDate}</span>
          </div>
          <div className="hidden sm:flex flex-col min-w-0 leading-tight">
            <span className="t-card font-display font-bold text-text truncate">
              {greeting(now)}{firstName ? `, ${firstName}` : null}
            </span>
            <span className="t-meta font-medium text-text-muted truncate">{pageLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-3 ml-auto shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {realUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={cn('inline-flex', ICON_BUTTON, 'border border-white/20 bg-white/10 text-white hover:bg-white/20')}
                title="Preview the app as someone else"
                aria-label="Preview as a person"
              >
                <Eye size={17} strokeWidth={2.25} />
              </button>
            )}
            <NotificationBell badgeRing={false} tone="dark" />
            <button
              onClick={toggleTheme}
              className={cn('hidden sm:inline-flex', ICON_BUTTON, 'overflow-hidden border', 'border-transparent text-white/80 hover:bg-white/10 hover:text-white')}
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
              items={accountActions}
              trigger={
                <button
                  title={user.name}
                  aria-label={`Account menu, ${user.name}${user.role ? `, ${roleLabel(user.role)}` : ''}`}
                  className="flex items-center gap-2.5 h-11 px-1.5 sm:pl-1 sm:pr-2.5 rounded-full sm:border sm:border-border/60 sm:bg-surface-hover/40 text-text-secondary cursor-pointer transition-colors duration-200 hover:bg-surface-hover sm:hover:border-border-hover hover:text-text active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 group"
                >
                  <span className="relative flex items-center justify-center size-8 rounded-full bg-linear-to-br from-primary-500 to-primary-700 text-white font-display font-bold t-meta shrink-0 ring-2 ring-surface">
                    {initials || <User size={14} strokeWidth={2.5} />}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface" aria-hidden="true" />
                  </span>
                  <span className="hidden lg:flex flex-col items-start min-w-0 leading-tight py-0.5">
                    <span className="max-w-[120px] truncate t-meta font-display font-bold text-text">{user.name}</span>
                    {user.role && (
                      <span className="max-w-[120px] truncate t-meta font-medium text-text-muted">{roleLabel(user.role)}</span>
                    )}
                  </span>
                  <ChevronDown size={14} className="hidden sm:inline text-text-light shrink-0 ml-1 group-hover:text-text-muted transition-colors" strokeWidth={2.5} />
                </button>
              }
            />
          )}
        </div>
      </div>
      {picking && <ViewAsPicker onClose={() => setPicking(false)} />}
    </header>
  );
};
