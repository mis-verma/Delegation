import { ShieldCheck, ShieldX } from 'lucide-react';
import { ApprovalStatusChip } from '../verificationChips/ApprovalStatusChip';
import { VerifiedByChip } from '../verificationChips/VerifiedByChip';
import { VerifiedAtChip } from '../verificationChips/VerifiedAtChip';

interface VerificationNoteBannerProps {
  note: string | null | undefined;
  approved: boolean;
  verifiedBy?: string | null;
  title?: string;
  verifiedAt?: string | null;
}

export const VerificationNoteBanner = ({
  note,
  approved,
  verifiedBy,
  title,
  verifiedAt,
}: VerificationNoteBannerProps) => {
  if (!note) return null;

  const tone = approved
    ? {
        shell: 'bg-surface-hover/60 border-border',
        tile: 'bg-success/15 text-success',
        body: 'text-text-secondary',
      }
    : {
        shell: 'bg-rose-500/10 border-rose-500/25',
        tile: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        body: 'text-slate-700 dark:text-slate-200',
      };

  return (
    <div className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all ${tone.shell}`}>
      <div className={`p-2 rounded-xl shrink-0 ${tone.tile}`}>
        {approved ? <ShieldCheck size={20} strokeWidth={2.5} /> : <ShieldX size={20} strokeWidth={2.5} />}
      </div>

      <div className="flex flex-col pt-0.5 min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <ApprovalStatusChip
            status={approved ? 'APPROVED' : 'REJECTED'}
            label={title ?? (approved ? 'Approved' : 'Sent back for changes')}
          />
          {verifiedBy && <VerifiedByChip verifierName={verifiedBy} />}
          {verifiedAt && <VerifiedAtChip timestamp={verifiedAt} />}
        </div>
        <p className={`text-sm leading-relaxed break-words ${tone.body}`}>{note}</p>
      </div>
    </div>
  );
};
