import { NavLink, useLocation } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { NavCountBadge } from './NavCountBadge';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { badgeSummary, useNavBadges, type NavBadgeMap } from './useNavBadges';
import {
  LayoutGrid,
  ClipboardList,
  TicketCheck,
  ClipboardCheck,
  ListTodo,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  /** The raised round button in the middle of the bar. Exactly one item has it. */
  center?: boolean;
}

// Delegation sits in the middle, raised: it is the screen people live in, and a centre button is the
// easiest one to reach with a thumb. Two tabs either side.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutGrid, exact: true },
  { to: '/tickets', label: 'Tickets', icon: TicketCheck, exact: false },
  { to: '/tasks', label: 'Delegation', icon: ClipboardList, exact: false, center: true },
  { to: '/todo', label: 'To-Do', icon: ListTodo, exact: false },
  { to: '/checklists', label: 'Checklists', icon: ClipboardCheck, exact: false },
];

// A floating rounded bar, inset from the screen edges like the header and sidebar cards, instead of a
// full-width strip glued to the bottom. No shadow: the border and the notch ring around the centre
// button give it separation. 12px labels (the old 10px was too small to read at arm's length).
export const BottomNav = () => {
  const location = useLocation();
  const badges = useNavBadges();
  const prefetchRoute = usePrefetchRoute();

  return (
    <nav
      // The strip the bar floats in is filled with the page colour, so scrolling text and cards no
      // longer show through the gaps at its sides and below it, and a tap in that strip no longer
      // lands on something hidden behind it.
      className="md:hidden fixed inset-x-0 bottom-0 z-40 px-3 pt-2 bg-background"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation bar"
    >
      <div className="relative h-14 max-w-lg mx-auto grid grid-cols-5 rounded-3xl border border-border/60 bg-surface bg-gradient-to-br from-primary-500/[0.07] to-transparent">
        {NAV_ITEMS.map(({ to, label, icon: Icon, exact, center }) => {
          const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
          const badge = to in badges ? badges[to as keyof NavBadgeMap] : undefined;
          const summary = badge ? badgeSummary(badge) : '';

          if (center) {
            return (
              <NavLink
                viewTransition
                key={to}
                to={to}
                aria-label={summary ? `${label}, ${summary}` : label}
                className="group relative flex flex-col items-center justify-end h-full pb-2 select-none outline-none [-webkit-tap-highlight-color:transparent]"
              >
                {/* The raised button. The surface-coloured ring cuts a notch into the bar around it. */}
                <span
                  className={`absolute -top-5 flex items-center justify-center size-12 rounded-full ring-4 ring-surface bg-gradient-to-br from-primary-500 to-primary-700 text-white transition-transform duration-150 group-active:scale-95 group-focus-visible:ring-primary-500/40 ${
                    isActive ? 'dark:from-primary-400 dark:to-primary-600' : ''
                  }`}
                >
                  <Icon size={22} strokeWidth={2.25} />
                </span>
                {badge && <NavCountBadge badge={badge} className="-top-6 left-1/2 ml-3" />}
                <span
                  className={`relative text-[0.6875rem] leading-none font-display tracking-tight ${
                    isActive ? 'text-primary-700 dark:text-primary-300 font-bold' : 'text-text-secondary font-semibold'
                  }`}
                >
                  {label}
                </span>
              </NavLink>
            );
          }

          return (
            <NavLink
              viewTransition
              key={to}
              to={to}
              onTouchStart={() => prefetchRoute(to)}
              aria-label={summary ? `${label}, ${summary}` : label}
              className="group relative flex flex-col items-center justify-center gap-1 h-full cursor-pointer select-none outline-none active:scale-[0.94] transition-transform duration-150 [-webkit-tap-highlight-color:transparent]"
            >
              <span className="relative flex items-center justify-center w-12 h-8">
                {isActive && (
                  <span className="absolute inset-0 rounded-full bg-primary-500/12 dark:bg-primary-400/15 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none" />
                )}
                <Icon
                  size={19}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  className={`relative transition-colors duration-200 ${
                    isActive ? 'text-primary-600 dark:text-primary-300' : 'text-text-muted group-hover:text-text'
                  }`}
                />
                {badge && <NavCountBadge badge={badge} className="-top-1.5 left-1/2 ml-1.5" />}
              </span>
              <span
                className={`relative text-[0.6875rem] leading-none font-display tracking-tight transition-colors duration-200 ${
                  isActive ? 'text-primary-700 dark:text-primary-300 font-bold' : 'text-text-muted font-medium group-hover:text-text'
                }`}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
