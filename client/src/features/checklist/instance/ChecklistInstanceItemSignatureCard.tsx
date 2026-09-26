import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import { SignaturePadCanvas } from './SignaturePadCanvas';

interface ChecklistInstanceItemSignatureCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemSignatureCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemSignatureCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [draft, setDraft] = useState<string | null>(item.signatureValue);
  const interactive = canWork && !isLocked;
  const label = item.signatureLabels?.[0] || 'Signature';

  return (
    <div className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, signatureValue: item.signatureValue ?? undefined })}
      />

      {/* The saved signature itself is NOT gated on `interactive` — it's evidence, and must stay
          visible to a reviewer/approver after the item (or the whole instance) locks. Only the
          capture UI (blank pad + Save) is for the still-editable case. */}
      {item.isDone && item.signatureValue ? (
        <div className="w-full max-w-sm rounded-md border border-border bg-surface p-1.5">
          <img src={item.signatureValue} alt={label} className="w-full h-[140px] object-contain rounded-sm bg-white" />
        </div>
      ) : interactive ? (
        <div className="flex flex-col gap-2">
          {setItemDone.isError && (
            <p className="text-xs text-danger">
              {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that signature."}
            </p>
          )}
          <SignaturePadCanvas label={label} disabled={item.isDone} onChange={setDraft} />
          <button
            onClick={() => draft && setItemDone.mutate({ itemId: item.id, isDone: true, signatureValue: draft })}
            disabled={!draft || setItemDone.isPending}
            className="w-fit flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
};
