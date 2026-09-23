import { formatRelativeTime } from '../dashboard/dashboardDisplay';
import type { UserPresence } from '../../api/admin';

// Shared by UserCard, UserRow (org structure), and the Who's Online page so the three don't each
// invent slightly different wording for the same three states.
export const presenceLabel = (presence: UserPresence | undefined): string => {
  if (!presence) return '';
  if (presence.online) return 'Active now';
  if (!presence.lastActiveAt) return 'Never active';
  return `Active ${formatRelativeTime(presence.lastActiveAt)}`;
};
