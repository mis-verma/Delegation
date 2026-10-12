import { ShieldCheck, ShieldX } from 'lucide-react';

interface VerificationNoteBannerProps {
  /** The verifier's note. Nothing renders when there isn't one. */
  note: string | null | undefined;
  /** Whether the item came back approved (task `done` / ticket `CLOSED`) or was sent back. */
  approved: boolean;
  /** Only used to distinguish "Approved" from "Sent back" — an approved item with no verifier
   *  recorded is still a change request, not a verification. */
  verifiedBy?: string | null;
}

/**
 * A verifier's decision note, shown on a task or ticket detail panel.
 *
 * Tasks and Tickets each had their own copy of this — identical logic (bail on no note, approved
 * vs sent-back, same two labels, same two icons) with different styling: the task version was
 * `p-3 rounded-xl text-xs` with a bare 14px icon, the ticket version `p-4 rounded-2xl text-sm`
 * with the icon in a tinted tile. Same message, two visual weights, depending on which detail
 * panel you happened to open. This is the ticket treatment, which was the more legible of the two.
 */
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
