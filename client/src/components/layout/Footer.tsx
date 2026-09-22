import { NavLink } from "react-router";
import defaultLogo from "../../assets/logo.png";
import { usePublicSettingsQuery } from "../../lib/maintenance";
import { resolveLogoUrl } from "../../lib/uploadsBase";

const LINKS = [
  { to: '/tasks', label: 'Delegation' },
  { to: '/projects', label: 'Projects' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/settings', label: 'Settings' },
];

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { data: publicSettings } = usePublicSettingsQuery();
  const orgName = publicSettings?.orgName ?? 'Karya';
  const logoSrc = resolveLogoUrl(publicSettings?.logoUrl) ?? defaultLogo;

  return (
    <footer
      className="w-full border-t border-border/60 mt-auto transition-colors"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
      }}
    >
      <div className="max-w-(--container-width) mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex flex-col md:flex-row items-center justify-between gap-x-6 gap-y-2">
        
        <NavLink
          to="/"
          className="flex items-center shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-lg p-0.5"
        >
          <img src={logoSrc} alt={orgName} className="h-6 w-auto object-contain group-hover:scale-105 transition-transform" />
        </NavLink>

        <nav className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          {LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  isActive
                    ? 'text-primary-600 dark:text-primary-300 font-semibold bg-primary-500/10'
                    : 'text-text-secondary hover:text-text hover:bg-surface-hover',
                ].join(' ')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="text-xs text-text-muted font-mono shrink-0">
          © {currentYear} {orgName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
};