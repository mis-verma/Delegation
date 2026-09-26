import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import { SignaturePadCanvas } from './SignaturePadCanvas';

interface ChecklistInstanceItemDualSignatureCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemDualSignatureCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemDualSignatureCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [first, setFirst] = useState<string | null>(item.signatureValue);
  const [second, setSecond] = useState<string | null>(item.secondSignatureValue);
  const interactive = canWork && !isLocked;
  const firstLabel = item.signatureLabels?.[0] || 'Signer 1';
  const secondLabel = item.signatureLabels?.[1] || 'Signer 2';

  return (
    <div className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({
          itemId: item.id, isDone: false,
          signatureValue: item.signatureValue ?? undefined, secondSignatureValue: item.secondSignatureValue ?? undefined,
        })}
      />

      {/* The saved signatures are NOT gated on `interactive` — they're evidence, and must stay
          visible to a reviewer/approver after the item (or the whole instance) locks. Only the
          capture UI (blank pads + Save) is for the still-editable case. */}
      {item.isDone && item.signatureValue && item.secondSignatureValue ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[[firstLabel, item.signatureValue], [secondLabel, item.secondSignatureValue]].map(([lbl, src]) => (
            <div key={lbl} className="flex flex-col gap-1">
              <span className="text-xs font-display font-medium text-text-secondary">{lbl}</span>
              <div className="rounded-md border border-border bg-surface p-1.5">
                <img src={src} alt={lbl} className="w-full h-[110px] object-contain rounded-sm bg-white" />
              </div>
            </div>
          ))}
        </div>
      ) : interactive ? (
        <div className="flex flex-col gap-3">
          {setItemDone.isError && (
            <p className="text-xs text-danger">
              {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save those signatures."}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SignaturePadCanvas label={firstLabel} disabled={item.isDone} onChange={setFirst} />
            <SignaturePadCanvas label={secondLabel} disabled={item.isDone} onChange={setSecond} />
          </div>
          <button
            onClick={() => first && second && setItemDone.mutate({ itemId: item.id, isDone: true, signatureValue: first, secondSignatureValue: second })}
            disabled={!first || !second || setItemDone.isPending}
            className="w-fit flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
            Save both signatures
          </button>
        </div>
      ) : null}
    </div>
  );
};
