import type { ReactNode } from 'react';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';

interface PersonRowProps {
  name: string;
  subtitle?: string;
  metric?: ReactNode;
  metricTone?: 'default' | 'success' | 'danger';
  /** Renders the rank to the left of the avatar, e.g. for a leaderboard. */
  index?: number;
  /** 0 to 100: draws a thin bar under the name, coloured like the figure. */
  progress?: number;
}

const BAR_TONE_CLASS: Record<NonNullable<PersonRowProps['metricTone']>, string> = {
  default: 'bg-primary-500',
  success: 'bg-success',
  danger: 'bg-danger',
};

const METRIC_TONE_CLASS: Record<NonNullable<PersonRowProps['metricTone']>, string> = {
  default: 'text-primary-700 dark:text-primary-400',
  success: 'text-success',
  danger: 'text-danger',
};

// Gold/silver/bronze for the top 3 ranks — TeamLeaderboardRail's only caller of `index` is
// literally a leaderboard, where "01" in the same flat gray as every other row buries the one
// piece of information (who's actually winning) the widget exists to show at a glance.
// Built from this app's own tokens, not raw Tailwind slate/orange — there's no dedicated
// silver/bronze token, so 2nd place borrows the neutral text-light/text-muted pair and 3rd
// borrows warning's amber, both of which already read as "metallic" without introducing colors
// outside the palette.
const MEDAL_CLASS: Record<number, string> = {
  0: 'bg-gradient-to-br from-coral-300 to-coral-600 text-white border-coral-700/20',
  1: 'bg-gradient-to-br from-text-light to-text-muted text-white border-border-hover/40',
  2: 'bg-gradient-to-br from-warning/70 to-warning text-white border-warning/30',
};

// A shared avatar + name + subtitle + metric row — consolidates what used to be three divergent
// hand-rolled implementations (features/team/PersonCard.tsx, features/admin/users/UserCard.tsx,
// and StoresPerformanceSection's inline leaderboard rows), all built on the same already-shared
// getInitials/avatarColorClass helpers.
export const PersonRow = ({ name, subtitle, metric, metricTone = 'default', index, progress }: PersonRowProps) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
    {/* Every rank is the same round chip; the top three get their medal colour, the rest stay neutral. */}
    {index != null && (
      <span className={`flex items-center justify-center size-6 rounded-full border t-meta font-display font-bold tabular-nums shrink-0 ${MEDAL_CLASS[index] ?? 'bg-surface-hover text-text-secondary border-border/60'}`}>
        {index + 1}
      </span>
    )}
    <span className={`flex items-center justify-center size-8 rounded-full text-white t-meta font-display font-bold shrink-0 ${avatarColorClass(name)}`}>
      {getInitials(name)}
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-display font-medium text-text truncate">{name}</p>
      {subtitle && <p className="t-meta font-display text-text-muted truncate">{subtitle}</p>}
      {progress != null && (
        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
          <span className={`block h-full rounded-full ${BAR_TONE_CLASS[metricTone]}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
      )}
    </div>
    {metric != null && (
      <span className={`text-base font-display font-bold tabular-nums shrink-0 ${METRIC_TONE_CLASS[metricTone]}`}>{metric}</span>
    )}
  </div>
);
