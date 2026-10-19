import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { Construction } from 'lucide-react';
import { Header, Footer, Sidebar, BottomNav } from '../../components/layout';
import { RouteFallback } from '../../components/skeleton';
import { PullToRefresh } from '../../components/pullToRefresh';
import { MaintenanceNotice } from '../../components/offlineBanner/MaintenanceNotice';
import { PageMaintenance } from '../../components/error/PageMaintenance';
import { isPathUnderMaintenance, maintenancePageLabel } from '../../lib/maintenance';
import { invalidateDashboardQueries } from '../../lib/dashboardQuery';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches,
  );
  const mobileDrawerOpen = isMobileViewport && sidebarOpen;

  useEffect(() => {
    const mobileMq = window.matchMedia('(min-width: 768px)');
    const railMq = window.matchMedia('(min-width: 1024px)');
    const handleMobileChange = (e: MediaQueryListEvent) => setIsMobileViewport(!e.matches);
    const handleRailChange = () => setSidebarOpen(false);
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

  const isAdmin = user?.role === 'ADMIN';
  const maintenanceMatch = isPathUnderMaintenance(location.pathname);
  const pageUnderMaintenance = maintenanceMatch && !isAdmin;

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

            <div className={`px-3 pt-3.5 sm:px-4 lg:px-5 xl:px-6 ${isHome ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(10.5rem+env(safe-area-inset-bottom))]'} md:pb-8 max-w-(--container-width) mx-auto w-full min-h-full flex flex-col`}>
              <MaintenanceNotice settingsPath="/admin/settings" />
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