import { memo, useState } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import { SignaturePadCanvas } from './SignaturePadCanvas';

interface ChecklistInstanceItemDualSignatureCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemDualSignatureCard = memo(function ChecklistInstanceItemDualSignatureCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemDualSignatureCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const interactive = canWork && !isLocked;
  const firstLabel = item.signatureLabels?.[0] || 'Signer 1';
  const secondLabel = item.signatureLabels?.[1] || 'Signer 2';

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({
          itemId: item.id, isDone: false,
          signatureValue: item.signatureValue ?? undefined, secondSignatureValue: item.secondSignatureValue ?? undefined,
        })}
      />

      {item.isDone && item.signatureValue && item.secondSignatureValue ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[[firstLabel, item.signatureValue], [secondLabel, item.secondSignatureValue]].map(([lbl, src]) => (
            <div key={lbl} className="flex flex-col gap-1">
              <span className="text-xs font-display font-medium text-text-secondary">{lbl}</span>
              <div className="rounded-lg border border-border bg-surface p-1.5">
                <img src={src} alt={lbl} loading="lazy" className="w-full h-[110px] object-contain rounded-sm bg-white" />
              </div>
            </div>
          ))}
        </div>
      ) : interactive ? (
        <div className="flex flex-col gap-3">
          <ItemError error={setItemDone.error} fallback="Couldn't save those signatures." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SignaturePadCanvas label={firstLabel} disabled={item.isDone} onChange={setFirst} />
            <SignaturePadCanvas label={secondLabel} disabled={item.isDone} onChange={setSecond} />
          </div>
          <ItemActionButton
            className="self-start"
            onClick={() => first && second && setItemDone.mutate({ itemId: item.id, isDone: true, signatureValue: first, secondSignatureValue: second })}
            disabled={!first || !second}
            isLoading={setItemDone.isPending}
          >
            Save both signatures
          </ItemActionButton>
        </div>
      ) : null}
    </ItemCardShell>
  );
});
