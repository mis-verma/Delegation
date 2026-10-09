import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useReplayOnChange } from '../../lib/useReplayOnChange';
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
  Radio,
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
import { getAdminBreadcrumbs } from "./adminBreadcrumbs";
import { ROLE_META } from './roleBadge';
import type { Role } from '../../api/auth';

/** Utility for intelligent Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Navigation Config ---
interface AdminNavChild {
  to: string;
  label: string;
}

interface AdminNavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end: boolean;
  // A section with children renders as an expandable group in the sidebar instead of a single
  // flat link, so every page that belongs to it is visible in the nav itself — not just
  // discoverable after the fact via the page's own breadcrumb.
  children?: AdminNavChild[];
}

// Two distinct checklist systems, both nested under one "Checklists" group so the sidebar shows
// what's inside instead of leaving them as unrelated-looking flat entries: recurring,
// store-scheduled checklists (built in the Builder wizard, auto-generated on a cadence) vs.
// one-off templates applied by hand to a single Task/Ticket.
const CHECKLIST_CHILDREN: AdminNavChild[] = [
  { to: '/admin/scheduled-checklists', label: 'Recurring Checklists' },
  { to: '/admin/checklist-compliance', label: 'Checklist Compliance' },
  { to: '/admin/checklist-weekly', label: 'Report' },
  { to: '/admin/checklist-store-daily', label: 'Store and Dept Scores' },
  { to: '/admin/holidays', label: 'Holidays' },
  { to: '/admin/dress-types', label: 'Dress Types' },
  { to: '/admin/checklist-former', label: 'Former People' },
  { to: '/admin/checklist-templates', label: 'Task Templates' },
];

const NAV: AdminNavItem[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview & Analytics', end: true },
  { to: '/admin/directory', icon: Contact, label: 'People & Teams', end: false },
  { to: '/admin/presence', icon: Radio, label: "Who's Online", end: false },
  { to: '/admin/scheduled-checklists', icon: Repeat, label: 'Checklists', end: false, children: CHECKLIST_CHILDREN },
  // Tickets and Team Delegations hidden from the sidebar for now (asked to be temporarily
  // removed, not deleted) — routes themselves still exist and work if linked to directly.
  // Re-add `TicketCheck`/`ClipboardList` to the lucide-react import above if restoring these.
  // { to: '/admin/tickets', icon: TicketCheck, label: 'Tickets', end: false },
  // { to: '/tasks/team', icon: ClipboardList, label: 'Team Delegations', end: false },
  { to: '/admin/reports', icon: FileDown, label: 'Reports', end: false },
  // Separate from Reports on purpose — that's an export tool, this is a browsable "who changed
  // what, when" trail over the generic AuditLog table every module already writes to.
  { to: '/admin/audit-log', icon: History, label: 'Audit Log', end: false },
  { to: '/admin/system-health', icon: HeartPulse, label: 'System Health', end: false },
  { to: '/admin/settings', icon: Settings, label: 'Settings', end: false },
];

// Light, token-based "chrome" (bg-surface + border), matching the header — not the navy gradient
// this used to be. A soft tinted pill marks the current page instead of a solid white-on-navy one,
// which reads calmer/more professional than a loud fill against a light rail.
const NAV_LINK_BASE =
  "group relative flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 min-h-11 lg:min-h-0 rounded-xl text-sm font-medium transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98]";
const NAV_LINK_ACTIVE = "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 font-semibold";
const NAV_LINK_INACTIVE = "text-text-secondary hover:bg-surface-hover hover:text-text";
const NAV_ICON_ACTIVE = "text-primary-600 dark:text-primary-300";
const NAV_ICON_INACTIVE = "text-text-light group-hover:text-text-muted";
const CHILD_LINK_BASE =
  "relative flex items-center min-w-0 min-h-11 lg:min-h-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500";
const CHILD_LINK_ACTIVE = "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 font-semibold";
const CHILD_LINK_INACTIVE = "text-text-muted hover:bg-surface-hover hover:text-text";

// "PC" and "Approval manager", not "Pc" and "Approval_manager".
// Collapsed rail: the name of an icon appears right beside it, instantly, in the brand colour, the
// same as the main sidebar. A plain wrapper div is the trigger so Radix never rewrites the link's own
// classes. Rendered in a portal, so the rail's overflow clipping cannot cut it off.
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

// Path-segment match, so '/admin/holidays' never matches a sibling like '/admin/holidays-old'.
const matchesPath = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

// The one child that is "current": longest matching `to` wins, so a detail page such as
// /admin/scheduled-checklists/:id or /builder still lights up its own child, not nothing.
const activeChildTo = (children: AdminNavChild[] | undefined, pathname: string) =>
  children?.filter((child) => matchesPath(pathname, child.to)).sort((a, b) => b.to.length - a.to.length)[0]?.to;

export const AdminLayout = () => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  useReplayOnChange(pageRef, location.pathname, location.search);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Overview & Analytics is open to ADMIN and PC (AdminOverviewRoute in App.tsx). System Health is
  // ADMIN-only on the server, so PC would only see a "server may be down" error there: hide it.
  const nav = user?.role === 'ADMIN' ? NAV : NAV.filter((item) => item.to !== '/admin/system-health');

  // Two different breakpoints, two different jobs — see the resize effect below for the full
  // reasoning (same split as the main app's Dashboard.tsx shell). `isMobileViewport` stays at
  // 768px (`md`, same as every other `md:` class in this shell); the rail's own default expanded
  // state now keys off 1024px (`lg`) instead, so a tablet in the 768-1023px gap gets the collapsed
  // icon rail (still one tap to expand) rather than the same ~260px rail a desktop gets.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  // `sidebarOpen` means two different things depending on viewport (see the comment on the resize
  // effect below) — this tracks which one so the mobile-drawer-only accessibility behavior further
  // down (Escape to close, focus trap, inerting the rest of the page) never fires for the desktop
  // rail's default "expanded" state, which would otherwise lock keyboard users out of the page.
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches
  );
  const mobileDrawerOpen = isMobileViewport && sidebarOpen;
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const wasMobileDrawerOpenRef = useRef(false);

  // Sections with children start expanded so their sub-pages are visible in the sidebar right
  // away, without an extra click to discover what's inside.
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

  // `sidebarOpen` doubles as "desktop expanded/collapsed" and "mobile drawer open/closed" — it's
  // only seeded from viewport width once, above, so resizing across a breakpoint without a reload
  // (e.g. desktop -> mobile) would otherwise leave a stale value: the mobile drawer could render
  // already open (with its backdrop) just because it was "open" as a desktop sidebar. Two separate
  // queries now, matching the two separate breakpoints the initial state above uses.
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

  // Mobile-drawer-only: Escape closes it, opening moves focus into the drawer, and closing returns
  // focus to the header's toggle button (id="admin-sidebar-toggle") — none of that ran before, so
  // a keyboard user opening the drawer had focus left behind on a now-hidden-under-backdrop button,
  // and closing it (Escape didn't even work) dropped focus back to the browser chrome.
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

  // Flattened so a child route (e.g. Checklist Compliance) resolves to its own specific label
  // rather than the parent group's generic one; longest matching `to` wins.
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

  // Which collapsed-rail item (by `to`) currently shows its hover/focus flyout — see
  // renderNavItem's collapsed-desktop branch below. One shared key instead of per-item state since
  // only one flyout is ever open at a time.
  const [flyoutKey, setFlyoutKey] = useState<string | null>(null);
  // Set for the duration of a programmatic "close the flyout and return focus to its trigger"
  // call (Escape / ArrowUp-from-first-item). Without it, refocusing the trigger synchronously
  // re-fires its own onFocus handler — which is what opened the flyout in the first place — and
  // reopens the very thing that focus move was meant to close, all within the same tick.
  const suppressFlyoutReopenRef = useRef(false);

  // Shared by both the mobile drawer and desktop rail so the expand/collapse behavior only needs
  // to be implemented once. `isDrawer` controls label visibility: the mobile drawer always shows
  // full labels, the desktop rail only when expanded (`sidebarOpen`).
  const renderNavItem = ({ to, icon: Icon, label, end, children }: AdminNavItem, isDrawer: boolean, index = 0) => {
    const hasChildren = !!children?.length;
    const showLabel = isDrawer || sidebarOpen;
    const isExpanded = expandedKeys.has(to);
    const activeChild = activeChildTo(children, location.pathname);
    const hasActiveChild = !!activeChild;
    // Same active-match rule NavLink applies internally for its `end` prop — computed here instead
    // of read from NavLink's own render-prop, because that render-prop path (and NavLink's
    // function-form `className`) doesn't survive being passed through Radix's `asChild`/Slot below
    // (the collapsed rail's Tooltip/Popover wrappers): Slot's prop-merge does a plain
    // `[a, b].join(' ')` on `className`, which is only ever written for two *strings* — handed a
    // *function* (react-router's supported form) it silently stringifies the function's own source
    // instead of calling it, so every collapsed rail item rendered with 0 padding, no flex layout,
    // and a giant runaway "active" indicator (percentage heights resolving against a far-off
    // ancestor once the link's own box collapsed to just its icon). Same isActive value either way
    // — this form just also survives Slot.
    // The Rankings page is part of Overview, so Overview stays lit there.
    const isItemActive = end ? location.pathname === to || (to === '/admin' && location.pathname === '/admin/rankings') : location.pathname.startsWith(to);
    const isActiveOrChild = isItemActive || hasActiveChild;
    // Collapsed desktop rail: labels are gone entirely (`hidden` removes them from the a11y tree
    // too), so a link's only remaining accessible name was its `title` attribute — which browsers
    // don't show on keyboard focus. And a group's children lost their toggle button in this state,
    // so they became completely unreachable without first re-expanding the rail. Both are fixed by
    // the flyout below instead of just leaving `title` as the sole affordance.
    const collapsedRail = !isDrawer && !sidebarOpen;

    const link = (
      <NavLink
        viewTransition
        to={to}
        end={end}
        onClick={(e) => {
          // Touch has no hover, so on the collapsed rail (tablet, 768-1023px) a tap on a group icon
          // opens its flyout of pages instead of jumping to the first one and hiding the rest.
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

        {/* Active Indicator Pip (desktop rail, collapsed only) */}
        {collapsedRail && isActiveOrChild && (
          <span className="absolute left-1 w-1 h-1/2 bg-primary-600 dark:bg-primary-400 rounded-full" />
        )}
      </NavLink>
    );

    return (
      // Same one-authored-moment entrance stagger TodoList.tsx already uses — plays once when the
      // rail first mounts (login / full page load), not on every route change, since this list
      // doesn't remount between admin pages. `motion-reduce:animate-none` keeps it out of the way
      // for anyone who asked for less motion.
      <div
        key={to}
        className="animate-in fade-in slide-in-from-left-1 duration-300 ease-out motion-reduce:animate-none"
        style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
        <div className="flex items-center gap-1">
          {collapsedRail && !hasChildren ? (
            <RailTip label={label}>{link}</RailTip>
          ) : collapsedRail && hasChildren ? (
            // Controlled via hover/focus on the anchor + content (not a click-toggling
            // PopoverTrigger) so the icon itself still navigates normally on click — this is a
            // hover flyout menu, not a click-to-open one. PopoverAnchor only affects positioning.
            <Popover open={flyoutKey === to} onOpenChange={(open) => setFlyoutKey(open ? to : null)}>
              <PopoverAnchor asChild>
                <div
                  className="flex-1 min-w-0"
                  data-nav-flyout-anchor={to}
                  onMouseEnter={() => setFlyoutKey(to)}
                  onMouseLeave={() => setFlyoutKey((k) => (k === to ? null : k))}
                  onFocus={() => { if (!suppressFlyoutReopenRef.current) setFlyoutKey(to); }}
                  // The popover's content is portaled to the end of <body> — NOT a DOM descendant
                  // of this anchor div — so moving focus into it (via the ArrowDown handler below)
                  // makes `e.currentTarget.contains(relatedTarget)` false even though the focus
                  // move is completely intentional. Without also checking the portaled content,
                  // this closed the flyout the instant focus entered it, unmounting the
                  // just-focused link and dropping focus to <body>.
                  onBlur={(e) => {
                    const next = e.relatedTarget as Node | null;
                    const movedIntoFlyout = document.querySelector(`[data-nav-flyout-content="${to}"]`)?.contains(next);
                    if (!e.currentTarget.contains(next) && !movedIntoFlyout) {
                      setFlyoutKey((k) => (k === to ? null : k));
                    }
                  }}
                  // ArrowDown is the discoverable way into the flyout's own links — matches the
                  // standard menu-button keyboard pattern (Tab is left alone for normal document
                  // order; it can't reach the flyout's links anyway, since Radix portals its
                  // content to the end of <body>, well outside this item's natural tab position).
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
                // Radix's Popover auto-dismisses on any focus/pointerdown it considers "outside"
                // the content — including our own PopoverAnchor, since Anchor only affects
                // positioning and isn't treated as part of the interactive boundary the way a real
                // PopoverTrigger is. Without this, Tab-focusing the anchor opens the flyout (via
                // onFocus below) and Radix immediately closes it again in the same tick, so a
                // keyboard-only user never actually sees it. Our own hover/focus state above is
                // already the real open/close authority, so any interaction with the anchor itself
                // is a no-op here, not a dismissal.
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
                <p className="px-2.5 py-1.5 text-xs font-display font-bold text-text-muted">{label}</p>
                {children!.map((child, childIndex) => {
                  const isChildActive = child.to === activeChild;
                  return (
                    <NavLink
                      viewTransition
                      key={child.to}
                      to={child.to}
                      onClick={() => { handleNavClick(); setFlyoutKey(null); }}
                      // Up/Down roves between the flyout's own links; Up from the first one (or
                      // Escape from anywhere) closes the flyout and returns focus to its trigger —
                      // the standard menu-button keyboard pattern.
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
          // Same grid-rows 0fr/1fr trick as the main Sidebar: `height: auto` isn't animatable in
          // CSS but `grid-template-rows` is, and it measures the content the same way. Stays
          // mounted so it animates closed too; `inert` keeps the links out of the tab order.
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

  return (
    <div className="flex flex-col h-svh overflow-hidden bg-background text-text transition-colors duration-300 font-sans">
      {/* Visually the backdrop below covers the header too (it's `fixed inset-0` above everything
          in normal flow), so it's inert-ed along with main/BottomNav while the drawer is open —
          otherwise a keyboard user could still tab into header buttons sitting under the dimmed
          overlay. */}
      <div inert={mobileDrawerOpen}>
        <AdminHeader onToggleSidebar={() => setSidebarOpen(v => !v)} pageLabel={currentNav?.label ?? 'Overview'} />
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile Backdrop Overlay */}
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className={cn(
            'md:hidden fixed inset-0 z-30 bg-black/50 touch-manipulation transition-opacity duration-200 ease-out motion-reduce:transition-none',
            sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        />

        {/* 1. Mobile Drawer */}
        <aside
          ref={mobileDrawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal={sidebarOpen}
          inert={!sidebarOpen}
          aria-label="Navigation menu"
          className={cn(
            "md:hidden fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[80vw] h-full flex flex-col rounded-r-3xl bg-surface border-r border-border px-4 pt-8 pb-6 transition-[translate] duration-300 ease-in-out focus:outline-none",
            // Flat edge (border only, no shadow), per the app's card convention.
            sidebarOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
          )}
        >
          {/* No brand mark here anymore — the header already carries the "Admin" context (its
              left slot reads "Admin / <page>"), so repeating a logo here was pure duplication.
              Just the section label remains. */}
          <p className="text-xs font-bold text-text-light tracking-wider pb-4 mb-3 border-b border-border px-2">
            Navigation
          </p>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {nav.map((item, i) => renderNavItem(item, true, i))}
          </nav>

          {/* Account summary + Log out — one bordered card instead of two stacked sections (a
              profile block, then a divider, then a full-width "Log out" row): sign-out is the
              one action this identity card exists to offer, so it lives inside the card as a
              trailing icon button rather than repeating the same avatar-card chrome a second
              time right below it. */}
          {user && (
            <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-xl bg-surface-hover border border-border shrink-0">
              <span className="relative flex items-center justify-center size-9 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-display font-bold text-xs shrink-0">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface-hover" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-display font-bold text-text truncate">{user.name}</p>
                {user.role && <p className="text-xs font-display font-medium text-text-muted truncate">{roleLabel(user.role)}</p>}
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

        {/* 2. Desktop Sidebar — a light, token-based floating card (bg-surface + border), matching
            the header. Used to be a bold navy gradient rail; two saturated bars stacked on top of
            each other read as busier and less professional than one calm surface. */}
        <aside
          className={cn(
            "hidden md:flex relative flex-col shrink-0 m-3 rounded-2xl bg-surface border border-border",
            "transition-all duration-300 ease-in-out overflow-hidden py-6",
            sidebarOpen ? "w-64 px-4" : "w-[84px] px-3"
          )}
        >
          {/* No brand mark here anymore — the header already carries the "Admin" context (its
              left slot reads "Admin / <page>"), so repeating a logo here was pure duplication.
              Just the section label remains. */}
          <p className={cn(
            "text-xs font-bold text-text-light tracking-wider pb-4 mb-3 border-b border-border px-2 transition-opacity duration-300",
            !sidebarOpen && "opacity-0 h-0 !p-0 !m-0 !border-0 overflow-hidden"
          )}>
            Navigation
          </p>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {nav.map((item, i) => renderNavItem(item, false, i))}
          </nav>

          {/* Account summary + Log out — one bordered card, not two stacked sections. Collapses
              to a vertical avatar-over-logout-icon stack rather than disappearing outright when
              the rail itself is collapsed. */}
          {user && (
            <div className={cn(
              "flex items-center gap-3 px-3 py-3 mt-2 rounded-xl bg-surface-hover border border-border shrink-0",
              !sidebarOpen && "flex-col gap-2 px-2"
            )}>
              {!sidebarOpen ? <RailTip label={user.name}><span className="relative flex items-center justify-center size-9 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-display font-bold text-xs shrink-0">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface-hover" aria-hidden="true" />
              </span></RailTip> : (
                <span className="relative flex items-center justify-center size-9 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-display font-bold text-xs shrink-0">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-surface-hover" aria-hidden="true" />
              </span>
              )}
              <div className={cn("min-w-0 flex-1 transition-opacity duration-300", !sidebarOpen && "hidden opacity-0")}>
                <p className="text-sm font-display font-bold text-text truncate">{user.name}</p>
                {user.role && <p className="text-xs font-display font-medium text-text-muted truncate">{roleLabel(user.role)}</p>}
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

        {/* Main Content Area */}
        <main inert={mobileDrawerOpen} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 bg-background">
          {/* pb-44 clears BottomNav plus any page's floating Fab (e.g. Tickets' Create FAB),
              which floats ~56px above the nav — see Dashboard.tsx's identical comment. */}
          {/* max-w-(--container-width), not max-w-7xl — matches the same token every other page
              in the app (Dashboard, Tasks, Tickets, Team Overview, Verification Queue) centers on,
              instead of sitting narrower with bigger side margins than its siblings. */}
          <div className="flex flex-col gap-4 max-w-(--container-width) mx-auto w-full p-3 sm:p-4 lg:px-6 lg:py-5 pb-44 md:pb-6">

            {/* Breadcrumbs — always rooted at "Dashboard" so every admin page has a one-click way
                back to the regular user dashboard, per the section-level trail in adminBreadcrumbs.ts */}
            {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

            {/* Route Transitions */}
            {/* Keying on the pathname remounts this node per navigation, replaying the entrance
                animation. The exit half is gone — holding a replaced page on screen is JS-only
                orchestration — and with it `mode="wait"`, which had been delaying every incoming
                admin page until the outgoing one finished leaving. */}
            <div
              ref={pageRef}
              key={location.pathname}
              className="w-full animate-in fade-in slide-in-from-bottom-2 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            >
              <Suspense fallback={<RouteFallback />}>
                <PageHeaderTitleContext.Provider value={false}>
                  <Outlet />
                </PageHeaderTitleContext.Provider>
              </Suspense>
            </div>

          </div>
        </main>

      </div>

      {/* Mobile Bottom Navigation */}
      <div inert={mobileDrawerOpen}>
        <BottomNav />
      </div>
    </div>
  );
};
