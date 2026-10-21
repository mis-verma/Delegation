import { ShieldCheck } from 'lucide-react';

interface HeadApprovedBannerProps {
  approver: { firstName: string; lastName?: string | null; role: string } | null | undefined;
  approvedAt: string;
  departmentName?: string;
}

const ROLE_TITLE: Record<string, string> = {
  MANAGER: 'Department head',
  SENIOR: 'Department head',
  PC: 'PC',
  ADMIN: 'Admin',
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

export const HeadApprovedBanner = ({ approver, approvedAt, departmentName }: HeadApprovedBannerProps) => {
  const name = approver ? `${approver.firstName}${approver.lastName ? ` ${approver.lastName}` : ''}` : null;
  const title = approver ? ROLE_TITLE[approver.role] ?? 'Approver' : 'Department head';
  const scope = title === 'Department head' && departmentName ? `${departmentName} head` : title;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/10 px-3.5 py-3" role="status">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-success to-success/70 text-white" aria-hidden="true">
        <ShieldCheck size={18} strokeWidth={2.4} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="t-card font-display font-bold leading-snug text-success">
          Approved{name ? ` by ${name}` : ''}
        </p>
        <p className="t-meta font-medium leading-snug text-text-secondary">
          {scope}, {formatWhen(approvedAt)}. The team could start work after this.
        </p>
      </div>
    </div>
  );
};
