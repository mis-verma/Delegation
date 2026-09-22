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
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

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