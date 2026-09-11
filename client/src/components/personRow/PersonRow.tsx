import type { ReactNode } from 'react';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';

interface PersonRowProps {
  name: string;
  subtitle?: string;
  metric?: ReactNode;
  metricTone?: 'default' | 'success' | 'danger';
  /** Renders a zero-padded rank number (01, 02, ...) to the left of the avatar, e.g. for a leaderboard. */
  index?: number;
}

const METRIC_TONE_CLASS: Record<NonNullable<PersonRowProps['metricTone']>, string> = {
  default: 'text-primary-700 dark:text-primary-400',
  success: 'text-success',
  danger: 'text-danger',
};

// A shared avatar + name + subtitle + metric row — consolidates what used to be three divergent
// hand-rolled implementations (features/team/PersonCard.tsx, features/admin/users/UserCard.tsx,
// and StoresPerformanceSection's inline leaderboard rows), all built on the same already-shared
// getInitials/avatarColorClass helpers.
export const PersonRow = ({ name, subtitle, metric, metricTone = 'default', index }: PersonRowProps) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
    {index != null && (
      <span className="w-5 text-xs font-display font-bold text-text-light tabular-nums shrink-0">
        {String(index + 1).padStart(2, '0')}
      </span>
    )}
    <span className={`flex items-center justify-center size-8 rounded-full text-white text-[11px] font-display font-bold shrink-0 ${avatarColorClass(name)}`}>
      {getInitials(name)}
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-display font-medium text-text truncate">{name}</p>
      {subtitle && <p className="text-xs font-display text-text-muted truncate">{subtitle}</p>}
    </div>
    {metric != null && (
      <span className={`text-base font-display font-bold tabular-nums shrink-0 ${METRIC_TONE_CLASS[metricTone]}`}>{metric}</span>
    )}
  </div>
);
