import { formatRelativeTime } from '../dashboard/dashboardDisplay';
import type { UserPresence } from '../../api/admin';

export const presenceLabel = (presence: UserPresence | undefined): string => {
  if (!presence) return '';
  if (presence.online) return 'Active now';
  if (!presence.lastActiveAt) return 'Never active';
  return `Active ${formatRelativeTime(presence.lastActiveAt)}`;
};
