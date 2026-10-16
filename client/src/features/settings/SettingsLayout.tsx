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
    <div className="flex flex-col gap-3 sm:gap-6 w-full max-w-(--container-width) mx-auto">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Your account and how the app looks for you." />

      {/* The same segmented switch as the rest of the app: equal parts filling a phone's width, the picked one white
          with a blue ring and a blue icon. */}
      <nav aria-label="Settings sections" className="max-w-full">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl border border-border/60 bg-surface-hover/60 sm:inline-grid">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'group flex min-w-0 items-center justify-center gap-1.5 h-9 pointer-coarse:h-10 px-2 sm:px-3.5 rounded-lg t-meta font-display transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  isActive
                    ? 'bg-surface text-primary-700 dark:text-primary-300 font-bold ring-1 ring-primary-500/30 [&_svg]:text-primary-600 dark:[&_svg]:text-primary-300'
                    : 'text-text-secondary font-semibold hover:text-text hover:bg-surface/70 [&_svg]:text-text-muted',
                ].join(' ')
              }
            >
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  );
};
