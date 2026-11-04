import { SheetGrabHandle } from '@/components/sheetGrabHandle';
import { Suspense, lazy, useRef, useState, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { NavCountBadge } from './NavCountBadge';
import { VerifyQueueBadge } from './VerifyQueueBadge';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { badgeSummary, useNavBadges, type NavBadgeMap } from './useNavBadges';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import type { QuickModule } from './quickSheet/QuickSheet';
import { haptic } from '../../lib/haptics';
import { useAuth } from '../../context/AuthContext';
import { SCROLL_TOP_EVENT, isRunDetailPath } from '../../lib/appNav';
import {
  Plus,
  LayoutGrid,
  ClipboardList,
  TicketCheck,
  ClipboardCheck,
  Crown,
  Grid3x3,
  LayoutDashboard,
  ListOrdered,
  ListTodo,
  ShieldQuestion,
  UserCheck,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  tint: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutGrid, exact: true, tint: 'primary' },
  { to: '/tickets', label: 'Tickets', icon: TicketCheck, exact: false, tint: 'coral' },
  { to: '/tasks', label: 'Delegation', icon: ClipboardList, exact: false, tint: 'info' },
  { to: '/todo', label: 'To-Do', icon: ListTodo, exact: false, tint: 'success' },
  { to: '/checklists', label: 'Checklists', icon: ClipboardCheck, exact: false, tint: 'primary' },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: false, tint: 'primary' },
  ...NAV_ITEMS.slice(1),
];

const PC_NAV_ITEMS: NavItem[] = [
  { to: '/pc', label: 'PC desk', icon: UserCheck, exact: false, tint: 'primary' },
  { to: '/tickets', label: 'Tickets', icon: TicketCheck, exact: false, tint: 'coral' },
  { to: '/tasks', label: 'Delegation', icon: ClipboardList, exact: false, tint: 'info' },
  { to: '/verify', label: 'Queue', icon: ShieldQuestion, exact: false, tint: 'coral' },
  { to: '/checklists', label: 'Checklists', icon: ClipboardCheck, exact: false, tint: 'primary' },
];

const OWNER_NAV_ITEMS: NavItem[] = [
  { to: '/admin/owner', label: 'Owner view', icon: Crown, exact: true, tint: 'primary' },
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true, tint: 'info' },
  { to: '/admin/scores', label: 'Scores', icon: ListOrdered, exact: false, tint: 'success' },
  { to: '/team/fill', label: 'Fill chart', icon: Grid3x3, exact: false, tint: 'success' },
];

const PC_QUEUE_TABS: ReadonlySet<string> = new Set(['/pc', '/verify']);

const GRID_COLS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };

const matchesTab = (pathname: string, to: string, exact: boolean) =>
  pathname === to || (!exact && pathname.startsWith(`${to}/`));

const TINTS: Record<string, { pill: string; text: string }> = {
  primary: { pill: 'bg-primary-500/15', text: 'text-primary-600 dark:text-primary-300' },
  coral: { pill: 'bg-coral-500/15', text: 'text-coral-600 dark:text-coral-400' },
  success: { pill: 'bg-success/15', text: 'text-success' },
  info: { pill: 'bg-info/15', text: 'text-info' },
};

const QUICK_CREATE: { label: string; hint: string; to: string; icon: LucideIcon }[] = [
  { label: 'New ticket', hint: 'Report a problem to a team', to: '/tickets?create=1', icon: TicketCheck },
  { label: 'New delegation', hint: 'Give someone a piece of work', to: '/tasks?create=1', icon: ClipboardList },
  { label: 'New to-do', hint: 'A note for yourself', to: '/todo?create=1', icon: ListTodo },
];

const LONG_PRESS_MS = 420;

const loadQuickSheet = () => import('./quickSheet/QuickSheet');
const QuickSheet = lazy(loadQuickSheet);

const QUICK_MODULES: ReadonlySet<string> = new Set<QuickModule>(['/tickets', '/tasks', '/todo', '/checklists']);

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const items = role === 'OWNER' ? OWNER_NAV_ITEMS : role === 'PC' ? PC_NAV_ITEMS : role === 'ADMIN' ? ADMIN_NAV_ITEMS : NAV_ITEMS;
  const isPc = role === 'PC';
  const [quickOpen, setQuickOpen] = useState(false);
  const createSheetRef = useRef<HTMLDivElement>(null);
  const [quick, setQuick] = useState<{ module: QuickModule; summary: string; open: boolean } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const startPress = (onLongPress: () => void) => {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      haptic('success');
      onLongPress();
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
      className="app-bottom-chrome md:hidden fixed inset-x-0 bottom-0 z-40 px-3 pt-2 bg-background"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation bar"
    >
      <div className={`relative h-16 max-w-lg mx-auto grid ${GRID_COLS[items.length] ?? 'grid-cols-5'} gap-1 rounded-3xl border border-border bg-surface px-1.5`}>
        {items.map(({ to, label, icon: Icon, exact, tint }) => {
          const look = TINTS[tint] ?? TINTS.primary;
          const isActive = matchesTab(location.pathname, to, exact);
          const badge = to in badges ? badges[to as keyof NavBadgeMap] : undefined;
          const summary = badge ? badgeSummary(badge) : '';
          const holdsCreate = to === '/tasks';
          const holdsQuick = !holdsCreate && QUICK_MODULES.has(to);
          const showsQueue = isPc && PC_QUEUE_TABS.has(to);
          const onLongPress = holdsCreate
            ? () => setQuickOpen(true)
            : holdsQuick
              ? () => setQuick({ module: to as QuickModule, summary, open: true })
              : null;

          const onTap = (e: MouseEvent) => {
            if (onLongPress && longPressed.current) { e.preventDefault(); longPressed.current = false; return; }
            retapTop(isActive);
          };

          return (
            <NavLink
              viewTransition
              key={to}
              to={to}
              end={exact}
              onTouchStart={() => { prefetchRoute(to); if (holdsQuick) void loadQuickSheet(); }}
              onClick={onTap}
              {...(onLongPress
                ? {
                    onPointerDown: () => startPress(onLongPress),
                    onPointerUp: endPress,
                    onPointerLeave: endPress,
                    onPointerCancel: endPress,
                    onContextMenu: (e: MouseEvent) => e.preventDefault(),
                  }
                : {})}
              aria-label={showsQueue ? undefined : summary ? `${label}, ${summary}` : label}
              className="group relative flex flex-col items-center justify-center gap-1 h-full min-w-0 rounded-2xl cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.94] motion-reduce:active:scale-100 transition-transform duration-150 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
            >
              <span
                className={`relative flex items-center justify-center h-8 rounded-full transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none ${
                  isActive ? `w-14 ${look.pill}` : 'w-12 bg-transparent'
                }`}
              >
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`relative transition-colors duration-200 ${isActive ? look.text : 'text-text-muted group-hover:text-text'}`}
                />
                {badge && <NavCountBadge badge={badge} className="-top-1.5 left-1/2 ml-1.5" />}
                {showsQueue && <VerifyQueueBadge compact className="-top-1.5 left-1/2 ml-1.5" />}
              </span>
              <span
                className={`relative max-w-full truncate text-xs leading-none font-display transition-colors duration-200 ${
                  isActive ? `${look.text} font-bold` : 'text-text-muted font-medium group-hover:text-text'
                }`}
              >
                {label}
              </span>
              {showsQueue && <VerifyQueueBadge srOnly />}
            </NavLink>
          );
        })}
      </div>
    </nav>
    {quick && (
      <Suspense fallback={null}>
        <QuickSheet
          open={quick.open}
          module={quick.module}
          summary={quick.summary}
          onClose={() => setQuick((q) => (q ? { ...q, open: false } : q))}
        />
      </Suspense>
    )}
    <Sheet open={quickOpen} onOpenChange={setQuickOpen}>
      <SheetContent ref={createSheetRef} side="bottom" showCloseButton={false} className="gap-0 rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-none">
        <SheetGrabHandle targetRef={createSheetRef} onClose={() => setQuickOpen(false)} />
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
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-800 text-white" aria-hidden="true">
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
