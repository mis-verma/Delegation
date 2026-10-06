import { NavLink, Outlet } from 'react-router';
import { Settings as SettingsIcon, Tag, UserCircle, Monitor } from 'lucide-react';
import { PageHeader } from '../../components';

const NAV = [
  { to: '/settings/account', icon: UserCircle, label: 'Account' },
  { to: '/settings/appearance', icon: Monitor, label: 'Appearance' },
  { to: '/settings/categories', icon: Tag, label: 'Categories' },
];

export const SettingsLayout = () => {
  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full max-w-(--container-width) mx-auto">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Your account and how the app looks for you." />

      {/* Scrolls sideways instead of wrapping, so every tab stays reachable on a narrow phone. Pills,
          like the People & Teams tabs, rather than a thin underline. */}
      <nav aria-label="Settings sections" className="overflow-x-auto no-scrollbar max-w-full">
        <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-surface-hover/50">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 min-h-11 sm:min-h-9 px-4 rounded-full text-sm font-display font-medium transition-colors shrink-0 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  isActive
                    ? 'bg-surface text-primary-700 dark:text-primary-300 border border-border font-semibold'
                    : 'border border-transparent text-text-secondary hover:text-text',
                ].join(' ')
              }
            >
              <Icon size={15} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  );
};
