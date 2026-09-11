import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useIsMobile } from '../../lib/useMediaQuery';
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Calendar,
  Settings,
  LogOut,
  TicketCheck,
  ShieldCheck,
  ClipboardCheck,
  ShieldQuestion,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
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
  { to: '/tasks/draft', label: 'Draft Delegations', soon: true },
  { to: '/tasks/archived', label: 'Archived', soon: true },
];

const PENDING_APPROVALS_CHILD: NavChild = { to: '/tasks?status=pending_verification', label: 'Pending Approvals' };
const SMART_DELEGATIONS_CHILD: NavChild = { to: '/tasks?category=delegation', label: 'Smart Delegations' };
const TASK_ADMIN_CHILDREN: NavChild[] = [
  { to: '/tasks/team', label: 'Team Delegations' },
];

const CHECKLIST_APPROVALS_CHILD: NavChild = { to: '/checklists/approvals', label: 'Team Approvals' };

const NAV: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'Delegation', children: TASK_CHILDREN },
  { to: '/tickets', icon: TicketCheck, label: 'Tickets' },
  { to: '/todo', icon: ListTodo, label: 'To-Do' },
  { to: '/events', icon: CalendarClock, label: 'Events' },
  { to: '/checklists', icon: ClipboardCheck, label: 'Checklists' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
];

const SETTINGS_ITEM: NavItem = { to: '/settings', icon: Settings, label: 'Settings' };

const isChildActive = (child: NavChild, location: { pathname: string; search: string }) =>
  child.to.includes('?')
    ? `${location.pathname}${location.search}` === child.to
    : location.pathname === child.to;

interface SidebarProps {
  isOpen: boolean;
  user: { id: string; name: string; email: string; role?: string } | null;
  logout: () => void;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}

export const Sidebar = ({ isOpen, user, logout, onNavigate, onToggleCollapse }: SidebarProps) => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === 'ADMIN';
  const isPC = user?.role === 'PC';
  const isManager = user?.role === 'MANAGER';
  const isSenior = user?.role === 'SENIOR';
  const seesSmartDelegations = isAdmin || isPC || isManager;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(NAV.filter((item) => item.children?.length).map((item) => item.to)),
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

  const navItems: NavItem[] = NAV.map((item) => {
    if (item.label === 'Checklists') {
      return {
        ...item,
        ...(isAdmin || isPC ? { quickCreateTo: '/admin/scheduled-checklists/builder' } : {}),
        ...(isManager ? { children: [CHECKLIST_APPROVALS_CHILD] } : {}),
      };
    }
    if (item.label === 'Delegation') {
      return {
        ...item,
        children: [
          ...(seesSmartDelegations ? [SMART_DELEGATIONS_CHILD] : []),
          ...(isPC ? [PENDING_APPROVALS_CHILD] : []),
          ...TASK_CHILDREN,
          ...(isPC ? TASK_ADMIN_CHILDREN : []),
        ],
      };
    }
    return item;
  });

  const adminNavItems: NavItem[] = [
    ...(isManager || isSenior ? [{ to: '/analytics', icon: BarChart3, label: 'Analytics' }] : []),
    ...(user?.role === 'PC' || user?.role === 'ADMIN'
      ? [{ to: '/verify', icon: ShieldQuestion, label: 'Verification Queue' }]
      : []),
    ...(isAdmin || isPC ? [{ to: '/team', icon: Building2, label: 'Team Overview' }] : []),
    ...(isAdmin || isPC ? [{ to: '/admin/directory', icon: ShieldCheck, label: 'Admin' }] : []),
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

    if (soon) {
      return (
        <span
          key={to}
          title={!showLabel ? `${label} — coming soon` : undefined}
          className={[
            'flex items-center rounded-xl text-[13px] font-semibold text-text-muted/60 cursor-not-allowed select-none',
            isDrawer ? 'px-3 py-3' : 'px-3 py-2.5',
            showLabel ? 'justify-between' : 'md:justify-center md:px-0',
          ].join(' ')}
        >
          <span className="flex items-center min-w-0">
            <span
              className={[
                'flex items-center justify-center shrink-0 rounded-lg bg-surface-hover/40 text-text-light',
                isDrawer ? 'size-8' : 'size-7',
              ].join(' ')}
            >
              <Icon size={16} strokeWidth={1.75} />
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
            <span className="shrink-0 ml-2 text-[10px] font-bold capitalize tracking-wide px-2 py-0.5 rounded-full bg-surface-hover/80 border border-border text-text-muted">
              Soon
            </span>
          )}
        </span>
      );
    }

    return (
      <div key={to}>
        <div className="flex items-center gap-1.5">
          <NavLink
            to={to}
            end={to === '/'}
            title={!showLabel ? label : undefined}
            onClick={handleNavClick}
            className={({ isActive }) =>
              [
                'group/link relative flex flex-1 min-w-0 items-center rounded-xl text-[13px] transition-colors duration-200 ease-out',
                isDrawer ? 'px-3 py-3' : 'px-3 py-2.5',
                showLabel ? 'justify-start' : 'md:justify-center md:px-0',
                isActive || hasActiveChild
                  ? 'text-primary-700 font-bold dark:text-primary-300'
                  : 'text-text-secondary font-semibold hover:bg-surface-hover hover:text-text',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {/* Gentle tint + left-accent bar (not a solid fill) — the accent bar lives inside
                    this same layoutId'd span so it slides together with the tint between items. */}
                {(isActive || hasActiveChild) && (
                  // Was a framer-motion `layoutId` span that physically slid from the previously
                  // active item to this one. CSS can't move an element between two separate DOM
                  // nodes, so the tint now appears in place and fades up instead of travelling.
                  // That shared-element slide is the one thing lost in dropping framer-motion from
                  // the shell; everything else here is a like-for-like CSS transition.
                  <span className="absolute inset-0 rounded-xl bg-primary-500/10 dark:bg-primary-400/10 animate-in fade-in duration-200 motion-reduce:animate-none">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[60%] w-[3px] rounded-r-full bg-primary-600 dark:bg-primary-400" />
                  </span>
                )}
                <span
                  className={[
                    'relative z-10 flex items-center justify-center shrink-0 rounded-lg transition-all duration-300',
                    isDrawer ? 'size-8' : 'size-7',
                    isActive || hasActiveChild
                      ? 'bg-primary-600 text-white dark:bg-primary-500'
                      : 'bg-surface-hover/60 text-text-muted  group-hover/link:bg-surface-active group-hover/link:text-text-secondary',
                  ].join(' ')}
                >
                  <Icon
                    size={16}
                    strokeWidth={isActive || hasActiveChild ? 2.25 : 1.75}
                    className="transition-transform duration-300 group-hover/link:scale-105"
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

          {hasChildren && showLabel && (
            <button
              type="button"
              onClick={() => toggleExpanded(to)}
              aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
              aria-expanded={isExpanded}
              className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
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
              to={quickCreateTo}
              onClick={handleNavClick}
              title={`New ${label}`}
              aria-label={`New ${label}`}
              className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              <Plus size={16} strokeWidth={2.5} />
            </NavLink>
          )}
        </div>

        {hasChildren && showLabel && (
          // `height: auto` is not animatable in CSS, but `grid-template-rows: 0fr -> 1fr` is, and
          // it measures the content the same way framer-motion's height:auto did. The submenu
          // stays mounted so it can animate both ways; `inert` keeps its links out of the tab
          // order and the accessibility tree while it's closed.
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
                        className={`flex items-center justify-between gap-2 rounded-lg px-3 text-[12px] font-medium text-text-muted/70 cursor-not-allowed select-none ${isDrawer ? 'py-2.5' : 'py-1.5'}`}
                      >
                        {child.label}
                        <span className="text-[10px] font-bold capitalize tracking-wide px-2 py-0.5 rounded-full bg-surface-hover/80 border border-border text-text-muted">
                          Soon
                        </span>
                      </span>
                    );
                  }

                  const isActiveChild = isChildActive(child, location);

                  return (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={handleNavClick}
                      className={[
                        'relative rounded-lg px-3 text-[12.5px] transition-all duration-200',
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 mb-4 shrink-0">
          <p
            className={[
              'text-[11px] font-bold text-text-muted capitalize tracking-wide',
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
                  'text-[11px] font-bold text-text-muted capitalize tracking-wide px-3',
                  'overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out',
                  (isDrawer || isOpen) ? 'max-h-5 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0',
                ].join(' ')}
              >
                Admin
              </p>
              {adminNavItems.map((item) => renderNavItem(item, isDrawer))}
            </>
          )}
        </nav>
      </div>

      <div className="shrink-0 pt-3 border-t border-border">
        <p
          className={[
            'text-[11px] font-bold text-text-muted capitalize tracking-wide px-3 mb-1',
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
            (isDrawer || isOpen) ? 'bg-surface-hover/50 border-border' : 'md:justify-center hover:bg-surface-hover/50',
          ].join(' ')}
        >
          <div
            className="size-9 rounded-full bg-primary-600 border border-border flex items-center justify-center text-white text-xs font-bold shrink-0"
            title={user?.name}
          >
            {initials}
          </div>

          <div
            className={[
              'flex items-center gap-2 min-w-0 overflow-hidden transition-all duration-300 ease-in-out',
              (isDrawer || isOpen) ? 'max-w-[12rem] opacity-100 ml-3' : 'max-w-0 opacity-0 ml-0',
            ].join(' ')}
          >
            <div className="flex-1 min-w-0 py-0.5">
              <p className="text-[13px] font-bold text-text truncate leading-tight">
                {user?.name}
              </p>
              <p className="text-[11px] font-medium text-text-muted truncate leading-tight mt-0.5">
                {user?.email}
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Log out"
              className="size-8 rounded-lg flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0 ml-1"
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
      {/* Scrim stays mounted and fades via opacity; `pointer-events-none` when closed is what
          makes an always-present full-screen overlay harmless. AnimatePresence was only ever
          buying the exit fade, which a CSS transition on a mounted node gives for free. */}
      <div
        onClick={onNavigate}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        inert={!isOpen}
        className={`md:hidden fixed top-0 left-0 z-50 w-[280px] max-w-[85vw] h-dvh flex flex-col px-4 pt-8 pb-5 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {renderContent(true)}
      </aside>

      <div className="hidden md:block relative shrink-0 h-full z-20">
        {/* Width comes straight from the --sidebar-width-* tokens. It used to be a pair of JS
            pixel constants that a comment asked you to keep "numerically in sync" with those
            tokens; that file is gone. One source of truth, and the rail transitions in CSS. */}
        <aside
          className={`flex flex-col h-full border-r border-border overflow-hidden py-5 bg-surface transition-[width,padding] duration-300 ease-out motion-reduce:transition-none ${
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
            className="absolute top-1/2 -right-3 -translate-y-1/2 z-30 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-all duration-200 cursor-pointer hover:text-primary-600 hover:border-primary-300 active:scale-90"
          >
            {isOpen ? <ChevronLeft size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
          </button>
        )}
      </div>
    </>
  );
};