import { memo, useState } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import { SignaturePadCanvas } from './SignaturePadCanvas';

interface ChecklistInstanceItemSignatureCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemSignatureCard = memo(function ChecklistInstanceItemSignatureCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemSignatureCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [draft, setDraft] = useState<string | null>(null);
  const interactive = canWork && !isLocked;
  const label = item.signatureLabels?.[0] || 'Signature';

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, signatureValue: item.signatureValue ?? undefined })}
      />

      {item.isDone && item.signatureValue ? (
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-1.5">
          <img src={item.signatureValue} alt={label} loading="lazy" className="w-full h-[140px] object-contain rounded-sm bg-white" />
        </div>
      ) : interactive ? (
        <div className="flex flex-col gap-2">
          <ItemError error={setItemDone.error} fallback="Couldn't save that signature." />
          <SignaturePadCanvas label={label} disabled={item.isDone} onChange={setDraft} />
          <ItemActionButton
            className="self-start"
            onClick={() => draft && setItemDone.mutate({ itemId: item.id, isDone: true, signatureValue: draft })}
            disabled={!draft}
            isLoading={setItemDone.isPending}
          >
            Save
          </ItemActionButton>
        </div>
      ) : null}
    </ItemCardShell>
  );
});
