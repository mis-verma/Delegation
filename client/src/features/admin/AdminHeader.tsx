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
import { AdminChromeAccents } from './AdminChromeAccents';

const ICON_BUTTON_DARK =
  'inline-flex items-center justify-center size-9 rounded-full text-white/70 ' +
  'transition-all duration-200 ease-out cursor-pointer ' +
  'hover:text-white hover:bg-white/10 active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

interface AdminHeaderProps {
  onToggleSidebar: () => void;
  pageLabel: string;
}

// Admin's own header chrome — deliberately distinct from the app-wide `Header` (which reads as a
// light, brand-first navbar). This one is a fixed-navy floating card, matching the admin
// sidebar's own `bg-primary-700` + `m-3` rounded-card treatment, so the two read as one unified
// "control chrome" wrapped around the light content area rather than a generic top bar. The
// sidebar already owns the brand mark, so this surfaces admin-specific context instead: which
// section you're in, right where a page title would otherwise go.
export const AdminHeader = ({ onToggleSidebar, pageLabel }: AdminHeaderProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const accountActions: DropdownAction[] = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
    { label: 'Sign out', onClick: logout, icon: LogOut, variant: 'destructive', separatorBefore: true },
  ];

  return (
    <header className="relative shrink-0 mx-3 mt-3 rounded-2xl bg-gradient-to-r from-primary-900 via-primary-800 to-primary-600 shadow-lg shadow-primary-900/20 overflow-hidden">
      <AdminChromeAccents scale="wide" />

      <div className="relative z-10 flex items-center gap-3 sm:gap-4 h-16 px-3 sm:px-5">
        {/* Left: sidebar toggle + dynamic "you are here" title (the brand mark already lives in
            the sidebar, so this slot carries context instead of repeating it) */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className={ICON_BUTTON_DARK}
            title="Toggle navigation sidebar"
            aria-label="Toggle navigation sidebar"
          >
            <PanelLeft size={19} strokeWidth={2} />
          </button>

          {/* A standalone, always-visible way back to the regular user dashboard — it existed
              before only inside the account dropdown (still does, kept for muscle memory), which
              took two clicks to find rather than one. */}
          <Link
            to="/"
            className={`${ICON_BUTTON_DARK} w-auto gap-1.5 px-3 hidden sm:inline-flex`}
            title="Back to your dashboard"
          >
            <LayoutDashboard size={16} strokeWidth={2} />
            <span className="text-[13px] font-display font-semibold">Dashboard</span>
          </Link>
          <Link
            to="/"
            className={`${ICON_BUTTON_DARK} sm:hidden`}
            title="Back to your dashboard"
            aria-label="Back to your dashboard"
          >
            <LayoutDashboard size={18} strokeWidth={2} />
          </Link>

          <span className="hidden sm:block h-8 w-px bg-white/15 shrink-0" aria-hidden="true" />

          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-[10px] font-bold tracking-widest text-white/40">Admin</span>
            <span className="text-sm sm:text-base font-display font-bold text-white truncate">{pageLabel}</span>
          </div>
        </div>

        {/* Right: quick actions + account */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/10 border border-white/15">
            <NotificationBell tone="dark" />
            <button
              onClick={toggleTheme}
              className={`${ICON_BUTTON_DARK} overflow-hidden size-8`}
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
                  className="flex items-center gap-2.5 h-10 pl-1 pr-2 sm:pr-3 rounded-full bg-white/10 border border-white/15 text-white/80 cursor-pointer transition-all duration-200 hover:bg-white/15 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 group"
                >
                  <span className="relative flex items-center justify-center size-8 rounded-full bg-white/20 text-white font-bold text-[11px] shrink-0 group-hover:scale-105 transition-transform">
                    {initials || <User size={14} strokeWidth={2.5} />}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-primary-700" aria-hidden="true" />
                  </span>
                  <span className="hidden lg:flex flex-col items-start min-w-0 leading-tight py-0.5">
                    <span className="max-w-[120px] truncate text-[13px] font-bold text-white">{user.name}</span>
                    {user.role && (
                      <span className="max-w-[120px] truncate text-[11px] font-medium text-white/55 mt-0.5">{titleCase(user.role)}</span>
                    )}
                  </span>
                  <ChevronDown size={14} className="hidden sm:inline text-white/50 shrink-0 ml-1 group-hover:text-white/80 transition-colors" strokeWidth={2.5} />
                </button>
              }
            />
          )}
        </div>
      </div>
    </header>
  );
};
