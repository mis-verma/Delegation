import { useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { NavCountBadge } from './NavCountBadge';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { badgeSummary, useNavBadges, type NavBadgeMap } from './useNavBadges';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import { haptic } from '../../lib/haptics';
import { SCROLL_TOP_EVENT, isRunDetailPath } from '../../lib/appNav';
import {
  Plus,
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
  center?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutGrid, exact: true },
  { to: '/tickets', label: 'Tickets', icon: TicketCheck, exact: false },
  { to: '/tasks', label: 'Delegation', icon: ClipboardList, exact: false, center: true },
  { to: '/todo', label: 'To-Do', icon: ListTodo, exact: false },
  { to: '/checklists', label: 'Checklists', icon: ClipboardCheck, exact: false },
];

const QUICK_CREATE: { label: string; hint: string; to: string; icon: LucideIcon }[] = [
  { label: 'New ticket', hint: 'Report a problem to a team', to: '/tickets?create=1', icon: TicketCheck },
  { label: 'New delegation', hint: 'Give someone a piece of work', to: '/tasks?create=1', icon: ClipboardList },
  { label: 'New to-do', hint: 'A note for yourself', to: '/todo?create=1', icon: ListTodo },
];

const LONG_PRESS_MS = 420;

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      haptic('success');
      setQuickOpen(true);
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const retapTop = (isActive: boolean) => {
    if (!isActive) return;
    haptic('tap');
    window.dispatchEvent(new Event(SCROLL_TOP_EVENT));
  };
  const badges = useNavBadges();
  const prefetchRoute = usePrefetchRoute();

  if (isRunDetailPath(location.pathname)) return null;

  return (
    <>
    <nav
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
                aria-haspopup="dialog"
                onPointerDown={startPress}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onPointerCancel={endPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => {
                  if (longPressed.current) { e.preventDefault(); longPressed.current = false; return; }
                  retapTop(isActive);
                }}
                className="group relative flex flex-col items-center justify-end h-full pb-2 select-none outline-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
              >
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
              onClick={() => retapTop(isActive)}
              aria-label={summary ? `${label}, ${summary}` : label}
              className="group relative flex flex-col items-center justify-center gap-1 h-full cursor-pointer select-none outline-none active:scale-[0.94] transition-transform duration-150 [-webkit-tap-highlight-color:transparent]"
            >
              <span className="relative flex items-center justify-center w-12 h-8">
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
    <Sheet open={quickOpen} onOpenChange={setQuickOpen}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-none">
        <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        <SheetTitle className="px-4 pt-3 pb-1 t-section font-display font-bold text-text">Create</SheetTitle>
        <SheetDescription className="sr-only">Start something new</SheetDescription>
        <ul className="flex flex-col gap-1 px-2 pt-1">
          {QUICK_CREATE.map(({ label, hint, to, icon: Icon }) => (
            <li key={to}>
              <button
                type="button"
                onClick={() => { haptic('tap'); setQuickOpen(false); void navigate(to); }}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 active:bg-surface-hover hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
                  <Icon className="size-5" strokeWidth={2.25} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-card font-display font-bold text-text">{label}</span>
                  <span className="t-meta text-text-muted">{hint}</span>
                </span>
                <Plus className="size-4 shrink-0 text-text-light" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
    </>
  );
};
