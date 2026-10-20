import { Link } from 'react-router';
import { ClipboardCheck, ClipboardList, ListTodo, TicketCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { badgeSummary, useNavBadges, type NavBadgeMap } from '../../components/layout/useNavBadges';

const SECTIONS: { to: keyof NavBadgeMap; label: string; icon: LucideIcon }[] = [
  { to: '/tasks', label: 'Delegations', icon: ClipboardList },
  { to: '/tickets', label: 'Tickets', icon: TicketCheck },
  { to: '/checklists', label: 'Checklists', icon: ClipboardCheck },
  { to: '/todo', label: 'To-Do', icon: ListTodo },
];

export const AttentionStrip = ({ onNavigate }: { onNavigate: () => void }) => {
  const badges = useNavBadges();
  const active = SECTIONS.filter((s) => badges[s.to].due + badges[s.to].overdue > 0);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 sm:px-5 py-3 border-b border-border/60 shrink-0 bg-surface-hover/40">
      <p className="t-meta font-display font-bold text-text-secondary">Needs your attention</p>
      <ul className="flex flex-wrap gap-1.5">
        {active.map(({ to, label, icon: Icon }) => {
          const badge = badges[to];
          const late = badge.overdue > 0;
          const count = late ? badge.overdue : badge.due;
          return (
            <li key={to}>
              <Link
                to={to}
                onClick={onNavigate}
                aria-label={`${label}, ${badgeSummary(badge)}`}
                className={cn(
                  'inline-flex min-h-9 pointer-coarse:min-h-11 items-center gap-1.5 rounded-full border pl-2.5 pr-1.5 t-meta font-display font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  late ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/15' : 'border-primary-500/25 bg-primary-500/10 text-primary-700 hover:bg-primary-500/15 dark:text-primary-300',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {label}
                <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 tabular-nums font-bold text-white', late ? 'bg-danger' : 'bg-primary-600 dark:bg-primary-500')}>
                  {count > 99 ? '99+' : count}
                </span>
                <span className="sr-only">{late ? 'overdue' : 'pending'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
