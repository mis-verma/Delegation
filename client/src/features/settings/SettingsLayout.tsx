import { NavLink, Outlet } from 'react-router';
import { Settings as SettingsIcon, Tag, UserCircle, Monitor } from 'lucide-react';
import { GradientIconTile } from '../../components';

const NAV = [
  { to: '/settings/account', icon: UserCircle, label: 'Account' },
  { to: '/settings/appearance', icon: Monitor, label: 'Appearance' },
  { to: '/settings/categories', icon: Tag, label: 'Categories' },
];

export const SettingsLayout = () => {
  return (
    <div className="flex flex-col gap-6 w-full max-w-(--container-width) mx-auto">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={SettingsIcon} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Settings</h1>
          <p className="text-sm text-text-muted mt-0.5">Your account and workspace preferences.</p>
        </div>
      </div>

      {/* overflow-x-auto + no-scrollbar (not flex-wrap) — on a narrow phone these three tabs ran
          past the viewport with no way to reach the last one at all (no scroll, no wrap, nothing
          clipped-but-reachable). A horizontal scroll strip keeps every tab reachable regardless of
          label count/length, same pattern FiltersPopover's own chip row already uses. */}
      <nav className="flex items-center gap-1 border-b border-border overflow-x-auto no-scrollbar">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-3.5 py-2.5 text-sm font-display font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap',
                isActive
                  ? 'border-primary-500 text-primary-600 dark:text-primary-300'
                  : 'border-transparent text-text-secondary hover:text-text hover:border-border-hover',
              ].join(' ')
            }
          >
            <Icon size={15} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
};
