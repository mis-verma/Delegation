import { Suspense, useState, useCallback, useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { Construction } from 'lucide-react';
import { Header, Sidebar, BottomNav } from '../../components/layout';
import { ViewAsBanner } from '../viewAs/ViewAsBanner';
import { RouteFallback } from '../../components/skeleton';
import { PullToRefresh } from '../../components/pullToRefresh';
import { MaintenanceNotice } from '../../components/offlineBanner/MaintenanceNotice';
import { PageMaintenance } from '../../components/error/PageMaintenance';
import { isPathUnderMaintenance, maintenancePageLabel } from '../../lib/maintenance';
import { invalidateDashboardQueries } from '../../lib/dashboardQuery';
import { directionBetween, hasBackArrow, type NavDirection } from '../../lib/appNav';
import { useEdgeSwipeOpen } from '../../lib/useEdgeSwipeOpen';
import { useEdgeSwipeBack } from '../../lib/useEdgeSwipeBack';

const SIDEBAR_KEY = 'karya-app-sidebar';
const RAIL_QUERY = '(min-width: 1024px)';

const readSidebarExpanded = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'open';
  } catch {
    return false;
  }
};

export const Dashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(RAIL_QUERY).matches && readSidebarExpanded(),
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches,
  );
  const [nav, setNav] = useState<{ path: string; dir: NavDirection }>({ path: location.pathname, dir: 'tab' });
  if (nav.path !== location.pathname) {
    setNav({ path: location.pathname, dir: directionBetween(nav.path, location.pathname) });
    if (isMobileViewport && sidebarOpen) setSidebarOpen(false);
  }
  const enterClass = nav.dir === 'forward'
    ? 'max-md:slide-in-from-right-6 md:slide-in-from-bottom-2'
    : nav.dir === 'back'
      ? 'max-md:slide-in-from-left-6 md:slide-in-from-bottom-2'
      : 'slide-in-from-bottom-2';
  const mobileDrawerOpen = isMobileViewport && sidebarOpen;

  useEffect(() => {
    if (!window.matchMedia(RAIL_QUERY).matches) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed');
    } catch {
      return;
    }
  }, [sidebarOpen]);

  useEffect(() => {
    const mobileMq = window.matchMedia('(min-width: 768px)');
    const railMq = window.matchMedia(RAIL_QUERY);
    const handleMobileChange = (e: MediaQueryListEvent) => {
      setIsMobileViewport(!e.matches);
      setSidebarOpen(false);
    };
    const handleRailChange = (e: MediaQueryListEvent) => setSidebarOpen(e.matches && readSidebarExpanded());
    mobileMq.addEventListener('change', handleMobileChange);
    railMq.addEventListener('change', handleRailChange);
    return () => {
      mobileMq.removeEventListener('change', handleMobileChange);
      railMq.removeEventListener('change', handleRailChange);
    };
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  useEdgeSwipeBack(isMobileViewport && !mobileDrawerOpen);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  useEdgeSwipeOpen(isMobileViewport && !mobileDrawerOpen && !hasBackArrow(location.pathname), openSidebar);

  const isAdmin = user?.role === 'ADMIN';
  const maintenanceMatch = isPathUnderMaintenance(location.pathname);
  const pageUnderMaintenance = maintenanceMatch && !isAdmin;

  const isHome = location.pathname === '/';
  const handleRefresh = useCallback(
    () => (isHome ? invalidateDashboardQueries(queryClient) : queryClient.invalidateQueries()),
    [isHome, queryClient],
  );
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const pathname = location.pathname;

  const page = useMemo(() => (
    <main id="main-content" tabIndex={-1} inert={mobileDrawerOpen} className="flex-1 min-w-0 relative outline-none">
      <PullToRefresh onRefresh={handleRefresh} scrollKey={pathname} className="relative z-10 h-full overflow-y-auto overflow-x-hidden overscroll-contain pointer-coarse:[scrollbar-width:none] pointer-coarse:[&::-webkit-scrollbar]:hidden">
        <div className="min-h-full flex flex-col">
          <div className={`px-3 pt-3.5 sm:px-4 lg:px-5 xl:px-6 ${isHome ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(13rem+env(safe-area-inset-bottom))]'} md:pb-8 max-w-(--container-width) mx-auto w-full flex-1 flex flex-col`}>
            <MaintenanceNotice settingsPath="/admin/settings" />
            <div className="flex-1 flex flex-col gap-4">
              {maintenanceMatch && isAdmin && (
                <div
                  role="status"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-warning/30 bg-warning/10 t-meta font-display font-medium text-text-secondary"
                >
                  <Construction size={15} className="text-warning shrink-0" />
                  <span>
                    This page is under maintenance for everyone else. You can see it because you&rsquo;re an admin.
                  </span>
                </div>
              )}
              <Suspense fallback={<RouteFallback />}>
                <div
                  ref={pageRef}
                  key={pathname}
                  className={`flex-1 flex flex-col h-full animate-in fade-in ${enterClass} duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none`}
                >
                  {pageUnderMaintenance ? <PageMaintenance pageName={maintenancePageLabel(pathname)} /> : <Outlet />}
                </div>
              </Suspense>
            </div>
          </div>
        </div>
      </PullToRefresh>
    </main>
  ), [handleRefresh, pathname, isHome, maintenanceMatch, isAdmin, enterClass, pageUnderMaintenance, mobileDrawerOpen]);

  const skipToContent = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('main-content')?.focus();
  };

  return (
    <div
      className="flex flex-col h-svh w-full overflow-hidden text-text pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      style={{ background: 'var(--color-background)' }}
    >
      <a
        href="#main-content"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-xl focus:border focus:border-border focus:bg-surface focus:px-4 t-card font-display font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        Skip to content
      </a>
      <ViewAsBanner />
      <Header onToggleSidebar={toggleSidebar} />

      <div className={`flex flex-1 min-h-0 relative ${mobileDrawerOpen ? 'z-50' : 'z-0'}`}>
        <Sidebar
          isOpen={sidebarOpen}
          user={user}
          onNavigate={closeSidebar}
          onToggleCollapse={toggleSidebar}
        />
        {page}
      </div>
      <BottomNav />
    </div>
  );
};