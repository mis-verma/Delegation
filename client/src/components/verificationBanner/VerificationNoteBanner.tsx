import { ShieldCheck, ShieldX } from 'lucide-react';

interface VerificationNoteBannerProps {
  note: string | null | undefined;
  approved: boolean;
  verifiedBy?: string | null;
}

export const VerificationNoteBanner = ({ note, approved, verifiedBy }: VerificationNoteBannerProps) => {
  if (!note) return null;

  const isVerified = approved && !!verifiedBy;
  const tone = approved
    ? { shell: 'bg-success/10 border-success/30', tile: 'bg-success/15 text-success', title: 'text-success', body: 'text-success/90' }
    : { shell: 'bg-warning/10 border-warning/30', tile: 'bg-warning/15 text-warning', title: 'text-warning', body: 'text-warning/90' };

  return (
    <div className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all ${tone.shell}`}>
      <div className={`p-2 rounded-xl shrink-0 ${tone.tile}`}>
        {approved ? <ShieldCheck size={20} strokeWidth={2.5} /> : <ShieldX size={20} strokeWidth={2.5} />}
      </div>

      <div className="flex flex-col pt-0.5 min-w-0">
        <p className={`t-card font-bold ${tone.title}`}>
          {isVerified ? 'Approved' : 'Sent back for changes'}
        </p>
        <p className={`mt-1 text-sm leading-relaxed break-words ${tone.body}`}>{note}</p>
      </div>
    </div>
  );
};
