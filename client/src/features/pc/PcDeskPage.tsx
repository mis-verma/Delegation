import { Link } from 'react-router';
import { CalendarOff, FileDown, Grid3x3, ListOrdered, ShieldQuestion, UserCheck, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../../components';
import { CoverBanner } from '../dashboard/CoverBanner';
import { NeedsApprovalCard } from '../dashboard/NeedsApprovalCard';
import { ExceptionsCard } from '../dashboard/ExceptionsCard';
import { PcStatTiles } from './PcStatTiles';

interface DeskLink {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const DESK_LINKS: DeskLink[] = [
  { to: '/verify', label: 'Verification Queue', hint: 'Review submitted work', icon: ShieldQuestion },
  { to: '/admin/scores', label: 'Scores', hint: 'Who is on track', icon: ListOrdered },
  { to: '/team/fill', label: 'Fill chart', hint: 'Daily checklist fills', icon: Grid3x3 },
  { to: '/leave', label: 'Leave', hint: 'Who is off today', icon: CalendarOff },
  { to: '/admin/reports', label: 'Reports', hint: 'Download exports', icon: FileDown },
];

export const PcDeskPage = () => (
  <div className="flex flex-col gap-6 pt-2.5">
    <PageHeader icon={UserCheck} title="PC desk" subtitle="Approvals that need you, and what is not done today." />
    <CoverBanner />
    <PcStatTiles />
    <nav aria-label="PC shortcuts" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {DESK_LINKS.map(({ to, label, hint, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          viewTransition
          className="flex min-h-14 items-center gap-3 rounded-lg border border-border/60 bg-surface px-3 py-2 transition-colors duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-300">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="t-card font-display font-semibold line-clamp-2 leading-snug">{label}</span>
            <span className="t-meta text-text-muted line-clamp-1 hidden sm:block">{hint}</span>
          </span>
        </Link>
      ))}
    </nav>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
      <NeedsApprovalCard />
      <ExceptionsCard />
    </div>
  </div>
);
