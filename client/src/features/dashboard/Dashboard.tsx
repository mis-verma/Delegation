import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { Construction } from 'lucide-react';
import { Header, Footer, Sidebar, BottomNav } from '../../components/layout';
import { RouteFallback } from '../../components/skeleton';
import { PullToRefresh } from '../../components/pullToRefresh';
import { PageMaintenance } from '../../components/error/PageMaintenance';
import { isPathUnderMaintenance, maintenancePageLabel } from '../../lib/maintenance';
import { invalidateDashboardQueries } from '../../lib/dashboardQuery';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  // Two different breakpoints doing two different jobs. `isMobileViewport` (768px, `md`) decides
  // structure — is the sidebar an overlay drawer at all, same threshold every other `md:` class in
  // this shell (BottomNav, Footer) already keys off. `sidebarOpen`'s own *default* — once it IS an
  // in-flow rail — keys off 1024px (`lg`) instead: a tablet in the 768-1023px gap used to get the
  // same full ~260px expanded rail as a desktop, which on an ~820px-wide screen left barely more
  // room for content than the phone drawer did. Below `lg`, the rail now starts collapsed to icons
  // (still one tap to expand). The desktop rail now starts collapsed too: icons only, with each name
  // shown in a tooltip on hover, so the page gets the full width until someone expands it.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // `sidebarOpen` means two different things depending on viewport — desktop expanded/collapsed,
  // or mobile drawer open/closed — so this tracks which one, same as AdminLayout's identical
  // split, letting the Escape-to-close effect below only ever apply to the mobile drawer.
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches,
  );
  const mobileDrawerOpen = isMobileViewport && sidebarOpen;

  useEffect(() => {
    const mobileMq = window.matchMedia('(min-width: 768px)');
    const railMq = window.matchMedia('(min-width: 1024px)');
    const handleMobileChange = (e: MediaQueryListEvent) => setIsMobileViewport(!e.matches);
    // Crossing the desktop breakpoint either way lands on the collapsed rail / closed drawer.
    const handleRailChange = () => setSidebarOpen(false);
    mobileMq.addEventListener('change', handleMobileChange);
    railMq.addEventListener('change', handleRailChange);
    return () => {
      mobileMq.removeEventListener('change', handleMobileChange);
      railMq.removeEventListener('change', handleRailChange);
    };
  }, []);

  // Mobile-drawer-only: Escape closes it, same fix already applied to AdminLayout's own drawer
  // (see its comment — this one was never mirrored here, so the app's main sidebar was still stuck
  // with the bug the admin one already fixed).
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  const isAdmin = user?.role === 'ADMIN';
  const maintenanceMatch = isPathUnderMaintenance(location.pathname);
  const pageUnderMaintenance = maintenanceMatch && !isAdmin;

  // On the home dashboard a pull refreshes just the queries the dashboard reads (tasks, tickets,
  // todos, checklists, events), not every cached query in the app. Other pages keep the broad
  // refresh: their own lists live under keys the dashboard does not know about.
  const isHome = location.pathname === '/';
  const handleRefresh = useCallback(
    () => (isHome ? invalidateDashboardQueries(queryClient) : queryClient.invalidateQueries()),
    [isHome, queryClient],
  );

  return (
    <div
      className="flex flex-col h-svh w-full overflow-hidden text-text"
      style={{ background: 'var(--color-background)' }}
    >
      <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />

      {/* The drawer lives in this box. While it is open on a phone the box is lifted above the header
          and the bottom bar (both are fixed or stacked higher), so the dimmed backdrop covers the
          whole screen and a tap on ANY blank spot closes the menu. At z-0 the backdrop was trapped
          underneath them, so a tap on the header or the bottom bar did nothing. */}
      <div className={`flex flex-1 min-h-0 relative ${mobileDrawerOpen ? 'z-50' : 'z-0'}`}>
        <Sidebar
          isOpen={sidebarOpen}
          user={user}
          logout={logout}
          onNavigate={() => setSidebarOpen(false)}
          onToggleCollapse={() => setSidebarOpen((v) => !v)}
        />

        
        <main className="flex-1 min-w-0 relative">
          <PullToRefresh onRefresh={handleRefresh} className="relative z-10 h-full overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {/* Bottom space on a phone clears the fixed bottom bar (about 4.75rem plus the safe area) with
                about 1rem to spare. Home has no floating add button, so it stops there. List pages also
                clear the add button above the bar (it sits at 6.25rem and is about 3.5rem tall), so the
                last card and the page arrows can scroll fully into view. */}
            <div className={`px-3 pt-3.5 sm:px-4 lg:px-5 xl:px-6 ${isHome ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(10.5rem+env(safe-area-inset-bottom))]'} md:pb-8 max-w-(--container-width) mx-auto w-full min-h-full flex flex-col`}>
              {maintenanceMatch && isAdmin && (
                <div
                  role="status"
                  className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl border border-warning/30 bg-warning/10 text-xs font-display font-medium text-text-secondary"
                >
                  <Construction size={15} className="text-warning shrink-0" />
                  <span>
                    This page is under maintenance for everyone else. You can see it because you&rsquo;re an admin.
                  </span>
                </div>
              )}
             
              {/* Suspense stays mounted across navigations; only the fade wrapper is keyed. A keyed
                  ancestor used to remount the boundary itself, and a fresh boundary always paints its
                  fallback, so React could never hold the old page while the next chunk downloaded. */}
              <Suspense fallback={<RouteFallback />}>
                <div
                  ref={pageRef}
                  key={location.pathname}
                  className="flex-1 flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none"
                >
                  {pageUnderMaintenance ? <PageMaintenance pageName={maintenancePageLabel(location.pathname)} /> : <Outlet />}
                </div>
              </Suspense>
            </div>
          </PullToRefresh>
        </main>
      </div>
      <div className="relative z-20 hidden md:block">
        <Footer />
      </div>

      <BottomNav />
    </div>
  );
};