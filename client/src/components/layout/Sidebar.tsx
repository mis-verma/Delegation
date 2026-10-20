import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePendingVerificationChecklistInstancesQuery } from '../../features/checklist/hook';
import { NavLink, useLocation } from 'react-router';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useIsMobile } from '../../lib/useMediaQuery';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { useTaskSummaryQuery } from '../../features/tasks/hook';
import { useTicketSummaryQuery } from '../../features/tickets/hook';
import { useTodoSummaryQuery } from '../../features/todo/hook';
import { useTodayChecklistSummary } from './useNavBadges';
import { SidebarSummaryBadge, type SidebarSummaryData } from './SidebarSummaryBadge';
import {
  LayoutDashboard,
  LayoutGrid,
  ClipboardList,
  Megaphone,
  CalendarDays,
  FolderKanban,
  Settings,
  LogOut,
  TicketCheck,
  ShieldCheck,
  ClipboardCheck,
  ShieldQuestion,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Grid3x3,
  BarChart3,
  ListTodo,
  Plus,
  X,
} from 'lucide-react';

interface NavChild {
  to: string;
  label: string;
  soon?: boolean;
}

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  children?: NavChild[];
  soon?: boolean;
  quickCreateTo?: string;
}

const TASK_CHILDREN: NavChild[] = [
  { to: '/tasks/draft', label: 'Draft Delegations' },
];

const PENDING_APPROVALS_CHILD: NavChild = { to: '/tasks?status=pending_approval', label: 'Pending Approvals' };
const SMART_DELEGATIONS_CHILD: NavChild = { to: '/tasks/smart', label: 'Smart Delegations' };
const TASK_ADMIN_CHILDREN: NavChild[] = [
  { to: '/tasks/team', label: 'Team Delegations' },
  { to: '/tasks/archived', label: 'Archived' },
];

const CHECKLIST_APPROVALS_CHILD: NavChild = { to: '/checklists/approvals', label: 'Team Approvals' };
const REVIEW_QUEUE_CHILD: NavChild = { to: '/checklists/approvals', label: 'To review' };
const CHECKLIST_HISTORY_CHILD: NavChild = { to: '/checklists/history', label: 'History' };
const CHECKLIST_WEEKLY_CHILD: NavChild = { to: '/checklists/weekly', label: 'Report' };

const NAV: NavItem[] = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard' },
  { to: '/tasks', icon: ClipboardList, label: 'Delegation', children: TASK_CHILDREN },
  { to: '/tickets', icon: TicketCheck, label: 'Tickets' },
  { to: '/todo', icon: ListTodo, label: 'To-Do' },
  { to: '/events', icon: Megaphone, label: 'Events' },
  { to: '/checklists', icon: ClipboardCheck, label: 'Checklists' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
];

const SETTINGS_ITEM: NavItem = { to: '/settings', icon: Settings, label: 'Settings' };

const isChildActive = (child: NavChild, location: { pathname: string; search: string }) =>
  child.to.includes('?')
    ? `${location.pathname}${location.search}` === child.to
    : location.pathname === child.to;

const RailTip = ({ label, show, children }: { label: string; show: boolean; children: ReactNode }) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <div className="flex flex-1 min-w-0">{children}</div>
    </TooltipTrigger>
    {show && (
      <TooltipContent
        side="right"
        sideOffset={12}
        hideArrow
        className="rounded-lg border border-primary-500/30 bg-primary-700 px-3 py-2 text-sm font-semibold text-white shadow-none dark:bg-primary-600"
      >
        {label}
      </TooltipContent>
    )}
  </Tooltip>
);

interface SidebarProps {
  isOpen: boolean;
  user: { id: string; name: string; email: string; role?: string } | null;
  logout: () => void;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}

export const Sidebar = ({ isOpen, user, logout, onNavigate, onToggleCollapse }: SidebarProps) => {
  const location = useLocation();
  const prefetchRoute = usePrefetchRoute();
  const isMobile = useIsMobile();
  const swipeStartX = useRef<number | null>(null);
  const isAdmin = user?.role === 'ADMIN';
  const isPC = user?.role === 'PC';
  const isManager = user?.role === 'MANAGER';
  const isSenior = user?.role === 'SENIOR';
  const canBeNamedReviewer = !!user && !isAdmin && !isPC && !isManager && !isSenior && user.role !== 'APPROVAL_MANAGER';
  const { data: reviewQueue } = usePendingVerificationChecklistInstancesQuery(1, canBeNamedReviewer);
  const hasReviewsWaiting = canBeNamedReviewer && (reviewQueue?.pages[0]?.meta?.total ?? 0) > 0;
  const seesSmartDelegations = isAdmin || isPC || isManager;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(
      NAV.filter((item) => item.children?.length && location.pathname.startsWith(item.to)).map((item) => item.to),
    ),
  );

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const { data: taskSummary } = useTaskSummaryQuery();
  const { data: ticketSummary } = useTicketSummaryQuery();
  const { data: todoSummary } = useTodoSummaryQuery();
  const { data: checklistSummary } = useTodayChecklistSummary();
  const SUMMARY_BY_LABEL: Partial<Record<string, SidebarSummaryData>> = {
    Delegation: taskSummary,
    Tickets: ticketSummary,
    'To-Do': todoSummary,
    Checklists: checklistSummary && {
      total: checklistSummary.total,
      newToday: checklistSummary.newToday,
      due: checklistSummary.due,
      overdue: checklistSummary.overdue,
      completed: checklistSummary.completed,
    },
  };

  const navRef = useRef<HTMLElement>(null);
  const [navOverflowsBelow, setNavOverflowsBelow] = useState(false);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const checkOverflow = () => setNavOverflowsBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    checkOverflow();

    el.addEventListener('scroll', checkOverflow);
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      resizeObserver.disconnect();
    };
  }, [expandedKeys, isOpen]);

  const navItems: NavItem[] = NAV.map((item) => {
    if (item.label === 'Checklists') {
      return {
        ...item,
        ...(isAdmin || isPC ? { quickCreateTo: '/admin/scheduled-checklists/builder' } : {}),
        ...(isAdmin || isPC || isManager || isSenior
          ? { children: [CHECKLIST_HISTORY_CHILD, CHECKLIST_WEEKLY_CHILD, ...(isManager || isSenior ? [CHECKLIST_APPROVALS_CHILD] : [])] }
          : hasReviewsWaiting ? { children: [REVIEW_QUEUE_CHILD] } : {}),
      };
    }
    if (item.label === 'Delegation') {
      return {
        ...item,
        quickCreateTo: '/tasks?create=1',
        children: [
          ...(seesSmartDelegations ? [SMART_DELEGATIONS_CHILD] : []),
          ...(isPC ? [PENDING_APPROVALS_CHILD] : []),
          ...TASK_CHILDREN,
          ...(isPC || isAdmin ? TASK_ADMIN_CHILDREN : []),
        ],
      };
    }
    if (item.label === 'Tickets') {
      return { ...item, quickCreateTo: '/tickets?create=1' };
    }
    if (item.label === 'To-Do') {
      return { ...item, quickCreateTo: '/todo?create=1' };
    }
    return item;
  });

  const adminNavItems: NavItem[] = [
    ...(isManager || isSenior ? [{ to: '/analytics', icon: BarChart3, label: 'Analytics' }] : []),
    ...(isManager || isSenior ? [{ to: '/admin/scores', icon: ListOrdered, label: 'Scores' }] : []),
    ...(isManager || isSenior ? [{ to: '/team/fill', icon: Grid3x3, label: 'Fill chart' }] : []),
    ...(user?.role === 'PC' || user?.role === 'ADMIN' || user?.role === 'APPROVAL_MANAGER'
      ? [{ to: '/verify', icon: ShieldQuestion, label: 'Verification Queue' }]
      : []),
    ...(isAdmin || isPC ? [{ to: '/admin', icon: ShieldCheck, label: 'Admin' }] : []),
  ];

  const handleNavClick = () => {
    if (isMobile) {
      onNavigate?.();
    }
  };

  const renderNavItem = ({ to, icon: Icon, label, children, soon, quickCreateTo }: NavItem, isDrawer: boolean) => {
    const hasActiveChild = children?.some((child) => !child.soon && isChildActive(child, location)) ?? false;
    const hasChildren = !!children?.length;
    const isExpanded = expandedKeys.has(to);
    const showLabel = isDrawer || isOpen;
    const entranceProps = {
      className: 'animate-in fade-in duration-150 ease-out motion-reduce:animate-none',
      style: { animationFillMode: 'backwards' as const },
    };

    if (soon) {
      return (
        <span
          key={to}
          title={!showLabel ? `${label} — coming soon` : undefined}
          className={[
            'flex items-center rounded-xl text-sm font-semibold text-text-muted/60 cursor-not-allowed select-none',
            isDrawer ? 'px-3 py-3' : 'px-3 py-2.5',
            showLabel ? 'justify-between' : 'md:justify-center md:px-0',
            entranceProps.className,
          ].join(' ')}
          style={entranceProps.style}
        >
          <span className="flex items-center min-w-0">
            <span className="flex items-center justify-center shrink-0 size-7 text-text-light">
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span
              className={[
                'truncate leading-none min-w-0 transition-all duration-300 ease-in-out',
                showLabel ? 'max-w-[10rem] opacity-100 ml-3' : 'max-w-0 opacity-0 ml-0',
              ].join(' ')}
            >
              {label}
            </span>
          </span>
          {showLabel && (
            <span className="shrink-0 ml-2 t-meta font-bold capitalize tracking-wide px-2 py-0.5 rounded-full bg-surface-hover/80 border border-border text-text-muted">
              Soon
            </span>
          )}
        </span>
      );
    }

    return (
      <div key={to} className={entranceProps.className} style={entranceProps.style}>
        <div className="group/row flex items-center gap-1.5">
          <RailTip label={label} show={!showLabel}>
          <NavLink
            viewTransition
            to={to}
            end={to === '/'}
            onClick={handleNavClick}
            onMouseEnter={() => prefetchRoute(to)}
            onFocus={() => prefetchRoute(to)}
            onTouchStart={() => prefetchRoute(to)}
            className={({ isActive }) =>
              [
                'group/link relative flex flex-1 min-w-0 items-center rounded-xl text-sm transition-colors duration-150 ease-out',
                isDrawer ? 'px-3 py-3' : 'px-3 py-2.5',
                showLabel ? 'justify-start' : 'md:justify-center md:px-0',
                isActive || hasActiveChild
                  ? 'bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 font-semibold'
                  : 'text-text-secondary font-medium hover:bg-surface-hover hover:text-text',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {!showLabel && (isActive || hasActiveChild) && (
                  <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 rounded-full bg-primary-600 dark:bg-primary-400" />
                )}
                <span
                  className={[
                    'relative z-10 flex items-center justify-center shrink-0 size-8 rounded-lg transition-colors duration-150',
                    isActive || hasActiveChild ? 'bg-primary-500/12 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300' : 'text-text-muted group-hover/link:text-text',
                  ].join(' ')}
                >
                  <Icon
                    size={19}
                    strokeWidth={isActive || hasActiveChild ? 2.2 : 1.9}
                    className="transition-transform duration-200 group-hover/link:scale-105"
                  />
                </span>
                <span
                  className={[
                    'relative z-10 truncate leading-none min-w-0 transition-all duration-300 ease-in-out',
                    showLabel ? 'max-w-[10rem] opacity-100 ml-3' : 'max-w-0 opacity-0 ml-0',
                  ].join(' ')}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
          </RailTip>

          {showLabel && (
            <SidebarSummaryBadge
              label={label}
              data={SUMMARY_BY_LABEL[label]}
              completedLabel={label === 'Tickets' ? 'Closed' : 'Completed'}
            />
          )}

          {hasChildren && showLabel && (
            <button
              type="button"
              onClick={() => toggleExpanded(to)}
              aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
              aria-expanded={isExpanded}
              className="shrink-0 flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              <ChevronDown
                size={16}
                strokeWidth={2.5}
                className={`transition-transform duration-300 ease-out ${isExpanded ? 'rotate-180 text-text' : 'rotate-0'}`}
              />
            </button>
          )}

          {quickCreateTo && showLabel && (
            <NavLink
              viewTransition
              to={quickCreateTo}
              onClick={handleNavClick}
              title={`New ${label}`}
              aria-label={`New ${label}`}
              className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-[color,background-color,opacity] md:opacity-0 md:group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              <Plus size={16} strokeWidth={2.5} />
            </NavLink>
          )}
        </div>

        {hasChildren && showLabel && (
          <div
            inert={!isExpanded}
            aria-hidden={!isExpanded}
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
              isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0">
              <div className="flex flex-col gap-1 mt-1 mb-2 ml-4 pl-4 ">
                {children!.map((child) => {
                  if (child.soon) {
                    return (
                      <span
                        key={child.to}
                        className={`flex items-center justify-between gap-2 rounded-lg px-3 t-meta font-medium text-text-muted/70 cursor-not-allowed select-none ${isDrawer ? 'py-2.5' : 'py-1.5'}`}
                      >
                        {child.label}
                        <span className="t-meta font-bold capitalize tracking-wide px-2 py-0.5 rounded-full bg-surface-hover/80 border border-border text-text-muted">
                          Soon
                        </span>
                      </span>
                    );
                  }

                  const isActiveChild = isChildActive(child, location);

                  return (
                    <NavLink
                      viewTransition
                      key={child.to}
                      to={child.to}
                      onClick={handleNavClick}
                      className={[
                        'relative rounded-lg px-3 t-meta transition-all duration-200',
                        isDrawer ? 'py-2.5' : 'py-1.5',
                        isActiveChild
                          ? 'bg-primary-50/50 text-primary-700 font-bold dark:bg-primary-500/10 dark:text-primary-300'
                          : 'text-text-secondary font-medium hover:bg-surface-hover hover:text-text',
                      ].join(' ')}
                    >
                      {isActiveChild && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-[19px] size-1.5 rounded-full bg-primary-500 ring-4 ring-surface" />
                      )}
                      {child.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = (isDrawer: boolean) => (
    <div className="flex flex-col h-full w-full justify-between">
      <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 mb-4 shrink-0">
          <p
            className={[
              't-meta font-bold text-text-light tracking-wider',
              'overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out',
              (isDrawer || isOpen) ? 'max-h-5 opacity-100' : 'max-h-0 opacity-0',
            ].join(' ')}
          >
            Workspace
          </p>
          {isDrawer && (
            <button
              type="button"
              onClick={onNavigate}
              className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label="Close menu"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <nav
          ref={isDrawer ? undefined : navRef}
          className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto pr-1.5 -mr-1.5 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {navItems.map((item) => renderNavItem(item, isDrawer))}

          {adminNavItems.length > 0 && (
            <>
              <div
                className={[
                  'border-t border-border transition-all duration-300 ease-in-out',
                  (isDrawer || isOpen) ? 'mt-4 mb-3 mx-1' : 'mt-3 mb-2 mx-2',
                ].join(' ')}
                aria-hidden="true"
              />
              <p
                className={[
                  'flex items-center gap-1.5 t-meta font-bold text-text-light tracking-wider px-3',
                  'overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out',
                  (isDrawer || isOpen) ? 'max-h-5 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0',
                ].join(' ')}
              >
                <span className="size-1.5 rounded-full bg-coral-500 shrink-0" aria-hidden="true" />
                Admin
              </p>
              {adminNavItems.map((item) => renderNavItem(item, isDrawer))}
            </>
          )}
        </nav>

        {!isDrawer && navOverflowsBelow && (
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-1.5 h-6 bg-gradient-to-t from-surface to-transparent pointer-events-none"
          />
        )}
      </div>

      <div className="shrink-0 pt-3 border-t border-border">
        <p
          className={[
            't-meta font-bold text-text-light tracking-wider px-3 mb-1',
            'overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out',
            (isDrawer || isOpen) ? 'max-h-5 opacity-100' : 'max-h-0 opacity-0',
          ].join(' ')}
        >
          Settings
        </p>
        {renderNavItem(SETTINGS_ITEM, isDrawer)}
      </div>

      <div className="shrink-0 pt-3 mt-1">
        <div
          className={[
            'flex items-center p-2 rounded-xl border border-transparent transition-all duration-300',
            (isDrawer || isOpen) ? 'bg-surface-hover border-border' : 'md:justify-center hover:bg-surface-hover/50',
          ].join(' ')}
        >
          <div
            className="relative size-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 ring-1 ring-inset ring-white/15 flex items-center justify-center text-white t-meta font-bold shrink-0"
            title={user?.name}
          >
            {initials}
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface" aria-hidden="true" />
          </div>

          <div
            className={[
              'flex items-center gap-2 min-w-0 overflow-hidden transition-all duration-300 ease-in-out',
              (isDrawer || isOpen) ? 'max-w-[12rem] opacity-100 ml-3' : 'max-w-0 opacity-0 ml-0',
            ].join(' ')}
          >
            <div className="flex-1 min-w-0 py-0.5">
              <p className="text-sm font-bold text-text truncate leading-tight">
                {user?.name}
              </p>
              <p className="t-meta font-medium text-text-muted truncate leading-tight mt-0.5">
                {user?.email}
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Log out"
              className="size-8 pointer-coarse:size-11 rounded-lg flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0 ml-1"
              aria-label="Log out"
            >
              <LogOut size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={onNavigate}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/50 touch-manipulation transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        inert={!isOpen}
        onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (swipeStartX.current !== null && swipeStartX.current - e.changedTouches[0].clientX > 60) onNavigate?.();
          swipeStartX.current = null;
        }}
        className={`md:hidden fixed top-0 left-0 z-50 w-[280px] max-w-[85vw] h-dvh flex flex-col rounded-r-3xl px-4 pt-8 pb-5 bg-surface border-r border-border transition-[translate,box-shadow] duration-200 ease-out will-change-transform motion-reduce:transition-none ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full shadow-none pointer-events-none'
        }`}
      >
        {renderContent(true)}
      </aside>

      <div className="hidden md:block relative shrink-0 h-full z-20 p-3">
        <aside
          className={`flex flex-col h-full rounded-2xl border border-border overflow-hidden py-5 bg-surface transition-[width,padding] duration-300 ease-out motion-reduce:transition-none ${
            isOpen ? 'w-(--sidebar-width-expanded) px-4' : 'w-(--sidebar-width-collapsed) px-3'
          }`}
        >
          {renderContent(false)}
        </aside>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="absolute top-1/2 right-0 -translate-y-1/2 z-30 flex size-6 pointer-coarse:size-9 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-all duration-200 cursor-pointer hover:text-primary-600 hover:border-primary-300 active:scale-90"
          >
            {isOpen ? <ChevronLeft size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
          </button>
        )}
      </div>
    </>
  );
};