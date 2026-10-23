import { Fragment, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { MaintenanceNotice } from '../../components/offlineBanner/MaintenanceNotice';
import {
  LayoutDashboard,
  Contact,
  Settings,
  FileDown,
  LogOut,
  Repeat,
  ChevronDown,
  History,
  HeartPulse,
  Grid3x3,
  Trophy,
  Crown,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { useAuth } from "../../context/AuthContext";
import { BottomNav } from "../../components/layout";
import { RouteFallback } from "../../components/skeleton";
import { Breadcrumbs } from "../../components/breadcrumbs";
import { PageHeaderTitleContext } from "../../components/pageHeader/pageHeaderContext";
import { Popover, PopoverAnchor, PopoverContent } from "../../components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../components/ui/tooltip";
import { AdminHeader } from "./AdminHeader";
import { ViewAsBanner } from "../viewAs/ViewAsBanner";
import { getAdminBreadcrumbs } from "./adminBreadcrumbs";
import { ROLE_META } from './roleBadge';
import type { Role } from '../../api/auth';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AdminNavChild {
  to: string;
  label: string;
}

type AdminNavGroup = 'insights' | 'people' | 'checklists' | 'system';

const GROUP_LABEL: Record<AdminNavGroup, string> = { insights: 'Insights', people: 'People', checklists: 'Checklists', system: 'System' };

interface AdminNavItem {
  group: AdminNavGroup;
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end: boolean;
  children?: AdminNavChild[];
}

const CHECKLIST_CHILDREN: AdminNavChild[] = [
  { to: '/admin/scheduled-checklists', label: 'Recurring Checklists' },
  { to: '/admin/holidays', label: 'Holidays' },
  { to: '/admin/dress-types', label: 'Dress Types' },
  { to: '/admin/checklist-former', label: 'Former People' },
  { to: '/admin/checklist-templates', label: 'Task Templates' },
];

const NAV: AdminNavItem[] = [
  { group: 'insights', to: '/admin/owner', icon: Crown, label: 'Owner view', end: false },
  { group: 'insights', to: '/admin', icon: LayoutDashboard, label: 'Overview & Analytics', end: true },
  { group: 'insights', to: '/admin/scores', icon: Trophy, label: 'Scores', end: false },
  { group: 'insights', to: '/team/fill', icon: Grid3x3, label: 'Checklist Fill', end: false },
  { group: 'people', to: '/admin/directory', icon: Contact, label: 'People & Teams', end: false },
  { group: 'checklists', to: '/admin/scheduled-checklists', icon: Repeat, label: 'Checklists', end: false, children: CHECKLIST_CHILDREN },
  { group: 'system', to: '/admin/reports', icon: FileDown, label: 'Reports', end: false },
  { group: 'system', to: '/admin/audit-log', icon: History, label: 'Audit Log', end: false },
  { group: 'system', to: '/admin/system-health', icon: HeartPulse, label: 'System Health', end: false },
  { group: 'system', to: '/admin/settings', icon: Settings, label: 'Settings', end: false },
];

const NAV_LINK_BASE =
  "group relative flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 min-h-11 lg:min-h-0 rounded-xl text-sm font-medium transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98]";
const NAV_LINK_ACTIVE = "bg-surface-hover text-text font-bold";
const NAV_LINK_INACTIVE = "text-text-secondary hover:bg-surface-hover hover:text-text";
const NAV_ICON_ACTIVE = "text-text";
const NAV_ICON_INACTIVE = "text-text-light group-hover:text-text-muted";
const CHILD_LINK_BASE =
  "relative flex items-center min-w-0 min-h-11 lg:min-h-0 rounded-lg px-3 py-2 t-meta font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500";
const CHILD_LINK_ACTIVE = "bg-surface-hover text-text font-bold";
const CHILD_LINK_INACTIVE = "text-text-muted hover:bg-surface-hover hover:text-text";

const RailTip = ({ label, children }: { label: string; children: ReactNode }) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <div className="flex flex-1 min-w-0 justify-center">{children}</div>
    </TooltipTrigger>
    <TooltipContent
      side="right"
      sideOffset={12}
      hideArrow
      className="rounded-lg border border-primary-500/30 bg-primary-700 px-3 py-2 text-sm font-semibold text-white shadow-none dark:bg-primary-600"
    >
      {label}
    </TooltipContent>
  </Tooltip>
);

const roleLabel = (role: Role) => ROLE_META[role]?.label ?? role;

const matchesPath = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

const activeChildTo = (children: AdminNavChild[] | undefined, pathname: string) =>
  children?.filter((child) => matchesPath(pathname, child.to)).sort((a, b) => b.to.length - a.to.length)[0]?.to;

export const AdminLayout = () => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const OWNER_NAV_PATHS = ['/admin/owner', '/admin', '/admin/scores', '/team/fill'];
  const nav = user?.role === 'ADMIN'
    ? NAV
    : user?.role === 'OWNER'
      ? NAV.filter((item) => OWNER_NAV_PATHS.includes(item.to))
      : NAV.filter((item) => item.to !== '/admin/system-health');

  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches
  );
  const mobileDrawerOpen = isMobileViewport && sidebarOpen;
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const wasMobileDrawerOpenRef = useRef(false);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(NAV.filter((item) => item.children?.length).map((item) => item.to))
  );
  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const mobileMq = window.matchMedia('(min-width: 768px)');
    const railMq = window.matchMedia('(min-width: 1024px)');
    const handleMobileChange = (e: MediaQueryListEvent) => setIsMobileViewport(!e.matches);
    const handleRailChange = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mobileMq.addEventListener('change', handleMobileChange);
    railMq.addEventListener('change', handleRailChange);
    return () => {
      mobileMq.removeEventListener('change', handleMobileChange);
      railMq.removeEventListener('change', handleRailChange);
    };
  }, []);

  useEffect(() => {
    if (mobileDrawerOpen) {
      mobileDrawerRef.current?.focus();
      wasMobileDrawerOpenRef.current = true;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setSidebarOpen(false);
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    if (wasMobileDrawerOpenRef.current) {
      document.getElementById('admin-sidebar-toggle')?.focus();
    }
    wasMobileDrawerOpenRef.current = false;
  }, [mobileDrawerOpen]);

  const flatNavEntries = NAV.flatMap((item) =>
    item.children?.length
      ? item.children.map((child) => ({ to: child.to, label: child.label, end: false }))
      : [{ to: item.to, label: item.label, end: item.end }]
  );
  const currentNav = flatNavEntries
    .filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const breadcrumbs = getAdminBreadcrumbs(location.pathname);

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const [flyoutKey, setFlyoutKey] = useState<string | null>(null);
  const suppressFlyoutReopenRef = useRef(false);

  const renderNavItem = ({ to, icon: Icon, label, end, children }: AdminNavItem, isDrawer: boolean, index = 0) => {
    const hasChildren = !!children?.length;
    const showLabel = isDrawer || sidebarOpen;
    const isExpanded = expandedKeys.has(to);
    const activeChild = activeChildTo(children, location.pathname);
    const hasActiveChild = !!activeChild;
    const isItemActive = end ? location.pathname === to : location.pathname.startsWith(to) || (to === '/admin/scores' && location.pathname.startsWith('/admin/data-check'));
    const isActiveOrChild = isItemActive || hasActiveChild;
    const collapsedRail = !isDrawer && !sidebarOpen;

    const link = (
      <NavLink
        viewTransition
        to={to}
        end={end}
        onClick={(e) => {
          if (collapsedRail && hasChildren && window.matchMedia('(pointer: coarse)').matches) {
            e.preventDefault();
            setFlyoutKey(to);
            return;
          }
          handleNavClick();
          setFlyoutKey(null);
        }}
        className={cn(
          NAV_LINK_BASE,
          !isDrawer && "focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          collapsedRail && "justify-center px-0",
          isActiveOrChild ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE
        )}
      >
        <Icon
          className={cn(
            "w-[17px] h-[17px] shrink-0 transition-all duration-300 group-hover:scale-110",
            isActiveOrChild ? NAV_ICON_ACTIVE : NAV_ICON_INACTIVE
          )}
          strokeWidth={isActiveOrChild ? 2 : 1.75}
        />
        <span className={cn("truncate transition-opacity duration-300", !showLabel && "hidden opacity-0")}>
          {label}
        </span>

        {isActiveOrChild && (
          <span aria-hidden="true" className="absolute left-0 w-1 h-1/2 bg-primary-600 dark:bg-primary-400 rounded-full" />
        )}
      </NavLink>
    );

    return (
      <div
        key={to}
        className="animate-in fade-in slide-in-from-left-1 duration-300 ease-out motion-reduce:animate-none"
        style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
        <div className="flex items-center gap-1">
          {collapsedRail && !hasChildren ? (
            <RailTip label={label}>{link}</RailTip>
          ) : collapsedRail && hasChildren ? (
            <Popover open={flyoutKey === to} onOpenChange={(open) => setFlyoutKey(open ? to : null)}>
              <PopoverAnchor asChild>
                <div
                  className="flex-1 min-w-0"
                  data-nav-flyout-anchor={to}
                  onMouseEnter={() => setFlyoutKey(to)}
                  onMouseLeave={() => setFlyoutKey((k) => (k === to ? null : k))}
                  onFocus={() => { if (!suppressFlyoutReopenRef.current) setFlyoutKey(to); }}
                  onBlur={(e) => {
                    const next = e.relatedTarget as Node | null;
                    const movedIntoFlyout = document.querySelector(`[data-nav-flyout-content="${to}"]`)?.contains(next);
                    if (!e.currentTarget.contains(next) && !movedIntoFlyout) {
                      setFlyoutKey((k) => (k === to ? null : k));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      (document.querySelector(`[data-nav-flyout-content="${to}"] a`) as HTMLAnchorElement | null)?.focus();
                    }
                  }}
                >
                  {link}
                </div>
              </PopoverAnchor>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={10}
                className="w-52 p-1.5"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onFocusOutside={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('[data-nav-flyout-anchor]')) e.preventDefault();
                }}
                onPointerDownOutside={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('[data-nav-flyout-anchor]')) e.preventDefault();
                }}
                onMouseEnter={() => setFlyoutKey(to)}
                onMouseLeave={() => setFlyoutKey(null)}
                data-nav-flyout-content={to}
              >
                <p className="px-2.5 py-1.5 t-meta font-display font-bold text-text-muted">{label}</p>
                {children!.map((child, childIndex) => {
                  const isChildActive = child.to === activeChild;
                  return (
                    <NavLink
                      viewTransition
                      key={child.to}
                      to={child.to}
                      onClick={() => { handleNavClick(); setFlyoutKey(null); }}
                      onKeyDown={(e) => {
                        const links = Array.from(
                          e.currentTarget.closest(`[data-nav-flyout-content="${to}"]`)?.querySelectorAll('a') ?? [],
                        );
                        const focusAnchor = () => {
                          suppressFlyoutReopenRef.current = true;
                          setFlyoutKey(null);
                          (document.querySelector(`[data-nav-flyout-anchor="${to}"] a`) as HTMLAnchorElement | null)?.focus();
                          suppressFlyoutReopenRef.current = false;
                        };
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          (links[childIndex + 1] as HTMLAnchorElement | undefined)?.focus();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (childIndex === 0) focusAnchor();
                          else (links[childIndex - 1] as HTMLAnchorElement | undefined)?.focus();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          focusAnchor();
                        }
                      }}
                      className={({ isActive: _isActive }) => cn(
                        "flex items-center min-w-0 min-h-11 lg:min-h-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                        isChildActive ? "bg-surface-hover text-text" : "text-text-secondary hover:bg-surface-hover hover:text-text"
                      )}
                    >
                      {isChildActive && <span aria-hidden="true" className="absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-full bg-primary-600 dark:bg-primary-400" />}
                      <span className="truncate">{child.label}</span>
                    </NavLink>
                  );
                })}
              </PopoverContent>
            </Popover>
          ) : link}

          {hasChildren && showLabel && (
            <button
              type="button"
              onClick={() => toggleExpanded(to)}
              aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
              aria-expanded={isExpanded}
              className="shrink-0 flex items-center justify-center size-11 lg:size-8 rounded-lg text-text-light hover:text-text hover:bg-surface-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <ChevronDown
                size={15}
                strokeWidth={2.5}
                className={cn("transition-transform duration-300 ease-out", isExpanded ? "rotate-180 text-text" : "rotate-0 text-text-light")}
              />
            </button>
          )}
        </div>

        {hasChildren && showLabel && (
          <div
            inert={!isExpanded}
            aria-hidden={!isExpanded}
            className={cn(
              'grid overflow-hidden transition-[grid-template-rows,opacity] duration-250 ease-out motion-reduce:transition-none',
              isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="min-h-0 pl-[19px]">
              <div className="flex flex-col gap-0.5 pt-1 pb-1.5 pl-3 border-l border-border">
                {children!.map((child) => {
                  const isChildActive = child.to === activeChild;
                  return (
                    <NavLink
                      viewTransition
                      key={child.to}
                      to={child.to}
                      onClick={handleNavClick}
                      className={cn(CHILD_LINK_BASE, isChildActive ? CHILD_LINK_ACTIVE : CHILD_LINK_INACTIVE)}
                    >
                      <span className="truncate">{child.label}</span>
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


  const renderNav = (isDrawer: boolean) =>
    nav.map((item, i) => {
      const starts = i === 0 || nav[i - 1].group !== item.group;
      const expanded = isDrawer || sidebarOpen;
      return (
        <Fragment key={item.to}>
          {starts && expanded && item.group !== 'checklists' && (
            <p className={cn('px-3 pb-1 t-meta font-display font-semibold text-text-light', i > 0 && 'pt-3')}>{GROUP_LABEL[item.group]}</p>
          )}
          {starts && expanded && item.group === 'checklists' && <span className="my-2 h-px w-full shrink-0 bg-border" aria-hidden="true" />}
          {starts && !expanded && i > 0 && <span className="my-1.5 h-px w-full shrink-0 bg-border" aria-hidden="true" />}
          {renderNavItem(item, isDrawer, i)}
        </Fragment>
      );
    });
  return (
    <div className="flex flex-col h-svh overflow-hidden bg-background text-text transition-colors duration-300 font-sans">
      <ViewAsBanner />
      <div inert={mobileDrawerOpen}>
        <AdminHeader onToggleSidebar={() => setSidebarOpen(v => !v)} pageLabel={currentNav?.label ?? 'Overview'} />
      </div>

      <div className="flex flex-1 min-h-0 relative">
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className={cn(
            'md:hidden fixed inset-0 z-30 bg-black/50 touch-manipulation transition-opacity duration-200 ease-out motion-reduce:transition-none',
            sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        />

        <aside
          ref={mobileDrawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal={sidebarOpen}
          inert={!sidebarOpen}
          aria-label="Navigation menu"
          className={cn(
            "md:hidden fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[80vw] h-full flex flex-col rounded-r-3xl bg-surface border-r border-border px-4 pt-8 pb-6 transition-[translate] duration-300 ease-in-out focus:outline-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
          )}
        >
          <p className="t-meta font-bold text-text-light tracking-wider pb-4 mb-3 border-b border-border px-2">
            Navigation
          </p>

          <nav className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {renderNav(true)}
          </nav>

          {user && (
            <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-xl bg-surface-hover border border-border shrink-0">
              <span className="relative flex items-center justify-center size-9 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-display font-bold t-meta shrink-0">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface-hover" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-display font-bold text-text truncate">{user.name}</p>
                {user.role && <p className="t-meta font-display font-medium text-text-muted truncate">{roleLabel(user.role)}</p>}
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
                className="shrink-0 inline-flex items-center justify-center size-11 lg:size-9 rounded-lg text-text-muted hover:bg-danger/10 hover:text-danger transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <LogOut className="w-[17px] h-[17px]" strokeWidth={1.75} />
              </button>
            </div>
          )}
        </aside>

        <aside
          className={cn(
            "hidden md:flex relative flex-col shrink-0 m-3 rounded-2xl bg-surface border border-border",
            "transition-all duration-300 ease-in-out overflow-hidden py-6",
            sidebarOpen ? "w-64 px-4" : "w-[84px] px-3"
          )}
        >
          <p className={cn(
            "t-meta font-bold text-text-light tracking-wider pb-4 mb-3 border-b border-border px-2 transition-opacity duration-300",
            !sidebarOpen && "opacity-0 h-0 !p-0 !m-0 !border-0 overflow-hidden"
          )}>
            Navigation
          </p>

          <nav className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {renderNav(false)}
          </nav>

          {user && (
            <div className={cn(
              "flex items-center gap-3 px-3 py-3 mt-2 rounded-xl bg-surface-hover border border-border shrink-0",
              !sidebarOpen && "flex-col gap-2 px-2"
            )}>
              {!sidebarOpen ? <RailTip label={user.name}><span className="relative flex items-center justify-center size-9 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-display font-bold t-meta shrink-0">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface-hover" aria-hidden="true" />
              </span></RailTip> : (
                <span className="relative flex items-center justify-center size-9 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-display font-bold t-meta shrink-0">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface-hover" aria-hidden="true" />
              </span>
              )}
              <div className={cn("min-w-0 flex-1 transition-opacity duration-300", !sidebarOpen && "hidden opacity-0")}>
                <p className="text-sm font-display font-bold text-text truncate">{user.name}</p>
                {user.role && <p className="t-meta font-display font-medium text-text-muted truncate">{roleLabel(user.role)}</p>}
              </div>
              {!sidebarOpen ? <RailTip label="Log out"><button
                type="button"
                onClick={logout}
                aria-label="Log out"
                className="shrink-0 inline-flex items-center justify-center size-11 lg:size-9 rounded-lg text-text-muted hover:bg-danger/10 hover:text-danger transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <LogOut className="w-[17px] h-[17px]" strokeWidth={1.75} />
              </button></RailTip> : (
                <button
                type="button"
                onClick={logout}
                aria-label="Log out"
                className="shrink-0 inline-flex items-center justify-center size-11 lg:size-9 rounded-lg text-text-muted hover:bg-danger/10 hover:text-danger transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <LogOut className="w-[17px] h-[17px]" strokeWidth={1.75} />
              </button>
              )}
            </div>
          )}
        </aside>

        <main inert={mobileDrawerOpen} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 bg-background">
          <div className="flex flex-col gap-4 max-w-(--container-width) mx-auto w-full p-3 sm:p-4 lg:px-6 lg:py-5 pb-44 md:pb-6">

            {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

            <div
              ref={pageRef}
              key={location.pathname}
              className="w-full animate-in fade-in slide-in-from-bottom-2 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            >
              <MaintenanceNotice settingsPath="/admin/settings" />
              <Suspense fallback={<RouteFallback />}>
                <PageHeaderTitleContext.Provider value={false}>
                  <Outlet />
                </PageHeaderTitleContext.Provider>
              </Suspense>
            </div>

          </div>
        </main>

      </div>

      <div inert={mobileDrawerOpen}>
        <BottomNav />
      </div>
    </div>
  );
};
