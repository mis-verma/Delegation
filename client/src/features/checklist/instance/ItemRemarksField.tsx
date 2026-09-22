import { useState } from 'react';
import { Clock, MessageSquare } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { Button } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ItemRemarksFieldProps {
  item: ChecklistInstanceItem;
  instanceId: string;
  // The item's parent instance is overdue and this item is still not done — a genuinely skipped
  // step should always carry an explanation, so the field is styled as required rather than
  // silently optional (there's no single "submit" action to hard-block on in this flow).
  required: boolean;
}

// Shared, item-type-agnostic remarks control — rendered once by ChecklistInstanceDetail around
// whichever card ITEM_CARD_RENDERERS picked, rather than duplicated inside all twelve item-type
// card components. AUDIT items are excluded by the caller — they already carry their own
// per-auditor remarks on ChecklistInstanceItemSubmission. Surfaces as a small status chip on the
// card (Overdue / Remarks added / Add remarks) that opens a popup to actually type the remark,
// keeping the per-item card itself unchanged.
export const ItemRemarksField = ({ item, instanceId, required }: ItemRemarksFieldProps) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(item.remarks ?? '');
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);

  const missing = required && !item.remarks?.trim();
  const hasRemarks = !!item.remarks?.trim();
  const dirty = value.trim() !== (item.remarks ?? '').trim();

  // Escape/overlay-click and the Cancel button all funnel through this same onOpenChange(false)
  // path — without this, typing a remark then dismissing either way silently threw it away, no
  // different from a stray tap outside the popup.
  const confirm = useConfirm();
  const handleOpenChange = async (next: boolean) => {
    if (!next && open && dirty) {
      const ok = await confirm({
        title: 'Discard this remark?',
        description: 'What you\'ve typed hasn\'t been saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setOpen(next);
    if (next) setValue(item.remarks ?? '');
  };

  const save = () => {
    mutation.mutate(
      { itemId: item.id, isDone: item.isDone, remarks: value.trim() },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={`flex items-center gap-1 self-start text-xs font-display font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer ml-2 ${
          missing
            ? 'bg-danger/10 text-danger hover:bg-danger/15'
            : 'bg-surface-hover text-text-muted hover:text-text hover:bg-surface-active'
        }`}
      >
        {missing ? <Clock size={11} /> : <MessageSquare size={11} />}
        {missing ? 'Overdue' : hasRemarks ? 'Remarks added' : 'Add remarks'}
      </button>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{item.label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className={`text-[11px] font-display font-medium ${missing ? 'text-danger' : 'text-text-muted'}`}>
            {required ? 'Remarks required — this item is overdue' : 'Remarks (optional)'}
          </label>
          <textarea
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={3}
            placeholder="Explain why this isn't done yet…"
            className={`px-2.5 py-1.5 text-sm font-display bg-surface text-text rounded-md border resize-none placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors duration-150 ${
              missing ? 'border-danger/50' : 'border-border'
            }`}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="primary" size="sm" onClick={save} disabled={!value.trim()} isLoading={mutation.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
