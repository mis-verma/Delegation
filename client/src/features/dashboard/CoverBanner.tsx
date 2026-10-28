import { Link } from 'react-router';
import { ChevronRight, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../checklist/checklistDisplay';
import { useApprovalCoverQuery } from '../checklist/useApprovalCover';

const COVER_ROLES = new Set(['ADMIN', 'PC', 'MANAGER', 'SENIOR']);

const CoverBannerContent = () => {
  const cover = useApprovalCoverQuery();
  const active = (cover.data?.received ?? []).filter((row) => row.active);
  if (active.length === 0) return null;

  const names = active.map((row) => row.fromName).join(', ');
  const until = formatDate(active.reduce((latest, row) => (new Date(row.endsAt) > new Date(latest) ? row.endsAt : latest), active[0].endsAt));

  return (
    <Link
      to="/tickets/approvals"
      viewTransition
      className="group flex min-h-14 items-center gap-3 rounded-2xl border border-vivid-blue/30 bg-vivid-blue/8 px-3.5 py-2.5 outline-none transition-colors duration-150 hover:border-vivid-blue/60 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-vivid-blue text-white" aria-hidden="true">
        <UserCheck size={18} strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-card font-display font-bold text-text">You are covering approvals for {names}</span>
        <span className="t-meta text-text-secondary">Until {until}. Their requests and finished work show in your approvals.</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
};

export const CoverBanner = () => {
  const { user } = useAuth();
  if (!user || !COVER_ROLES.has(user.role)) return null;
  return <CoverBannerContent />;
};
