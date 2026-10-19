import { Construction } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePublicSettingsQuery } from '../../lib/maintenance';

export const MaintenanceNotice = ({ settingsPath }: { settingsPath: string }) => {
  const { token, user } = useAuth();
  const { data } = usePublicSettingsQuery();
  const canSee = !!token && (user?.role === 'ADMIN' || user?.role === 'PC');
  if (!canSee || !data?.maintenanceMode) return null;
  return (
    <div role="status" className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl border border-warning/30 bg-warning/10 t-meta font-display font-medium text-text-secondary">
      <Construction size={15} className="text-warning shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">Maintenance mode is on. Everyone else sees the maintenance page.</span>
      <a href={settingsPath} className="shrink-0 font-semibold text-warning underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-warning/40 rounded">
        Switch off
      </a>
    </div>
  );
};
