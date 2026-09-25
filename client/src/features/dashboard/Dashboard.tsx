import { Suspense, useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { Construction } from 'lucide-react';
import { Header, Footer, Sidebar, BottomNav } from '../../components/layout';
import { RouteFallback } from '../../components/skeleton';
import { PullToRefresh } from '../../components/pullToRefresh';
import { PageMaintenance } from '../../components/error/PageMaintenance';
import { isPathUnderMaintenance, maintenancePageLabel } from '../../lib/maintenance';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Two different breakpoints doing two different jobs. `isMobileViewport` (768px, `md`) decides
  // structure — is the sidebar an overlay drawer at all, same threshold every other `md:` class in
  // this shell (BottomNav, Footer) already keys off. `sidebarOpen`'s own *default* — once it IS an
  // in-flow rail — keys off 1024px (`lg`) instead: a tablet in the 768-1023px gap used to get the
  // same full ~260px expanded rail as a desktop, which on an ~820px-wide screen left barely more
  // room for content than the phone drawer did. Below `lg`, the rail now starts collapsed to icons
  // (still one tap to expand); a real desktop still opens expanded as before.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
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
    const handleRailChange = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
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

  const handleRefresh = useCallback(() => queryClient.invalidateQueries(), [queryClient]);

  return (
    <div
      className="flex flex-col h-svh w-full overflow-hidden text-text transition-colors duration-300"
      style={{ background: 'var(--color-background)' }}
    >
      <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />

      <div className="flex flex-1 min-h-0 relative z-0">
        <Sidebar
          isOpen={sidebarOpen}
          user={user}
          logout={logout}
          onNavigate={() => setSidebarOpen(false)}
          onToggleCollapse={() => setSidebarOpen((v) => !v)}
        />

        
        <main className="flex-1 min-w-0 relative">
          <PullToRefresh onRefresh={handleRefresh} className="relative z-10 h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            <div className="p-4 sm:p-6 lg:p-8 xl:p-10 pb-44 md:pb-8 max-w-(--container-width) mx-auto w-full min-h-full flex flex-col">
              {maintenanceMatch && isAdmin && (
                <div
                  role="status"
                  className="flex items-center gap-2.5 mb-4 px-3.5 py-2.5 rounded-xl border border-warning/30 bg-warning/10 text-xs font-display font-medium text-text-secondary"
                >
                  <Construction size={15} className="text-warning shrink-0" />
                  <span>
                    This page is under maintenance for everyone else — you can see it because you&rsquo;re an admin.
                  </span>
                </div>
              )}
             
              <div
                key={location.pathname}
                className="flex-1 flex flex-col h-full animate-in fade-in slide-in-from-bottom-3 duration-350 ease-out"
              >
                <Suspense fallback={<RouteFallback />}>
                  {pageUnderMaintenance ? <PageMaintenance pageName={maintenancePageLabel(location.pathname)} /> : <Outlet />}
                </Suspense>
              </div>
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