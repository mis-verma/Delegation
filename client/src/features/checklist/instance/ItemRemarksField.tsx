import { memo, useCallback, useState } from 'react';
import { MessageSquare, MessageSquareWarning, Ban, Pencil } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { Button, Textarea } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ItemRemarksFieldProps {
  item: ChecklistInstanceItem;
  instanceId: string;
  required: boolean;
  canEdit: boolean;
}

type Mode = 'remark' | 'na';

const COPY: Record<Mode, { title: string; hint: string; placeholder: string; save: string }> = {
  remark: {
    title: 'Remark',
    hint: 'A note for whoever reviews this checklist.',
    placeholder: 'e.g. Shelf 3 restocked from the back store',
    save: 'Save remark',
  },
  na: {
    title: 'Mark as not applicable',
    hint: "Say why this step doesn't apply today. It counts as done, and the reviewer sees your reason.",
    placeholder: 'e.g. No cash deliveries on Sundays',
    save: 'Mark not applicable',
  },
};

const AUDIT_NA_COPY = {
  hint: "Say why there's nobody to check today. The whole audit counts as done, and the reviewer sees your reason.",
  placeholder: 'e.g. Store was closed today',
};

interface RemarkDialogProps {
  item: ChecklistInstanceItem;
  instanceId: string;
  mode: Mode;
  saved: string;
  missing: boolean;
  onClose: () => void;
}

const RemarkDialog = ({ item, instanceId, mode, saved, missing, onClose }: RemarkDialogProps) => {
  const [value, setValue] = useState(saved);
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);
  const confirm = useConfirm();
  const dirty = value.trim() !== saved;

  const handleOpenChange = async (next: boolean) => {
    if (next) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Discard this?',
        description: "What you've typed hasn't been saved.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = () => {
    const text = value.trim();
    if (mode === 'na') {
      mutation.mutate(
        { itemId: item.id, isDone: true, notApplicable: true, remarks: text },
        { onSuccess: onClose },
      );
      return;
    }
    mutation.mutate(
      { itemId: item.id, isDone: item.isDone, remarks: text || null },
      { onSuccess: onClose },
    );
  };

  const baseCopy = COPY[mode];
  const copy = mode === 'na' && item.itemType === 'AUDIT' ? { ...baseCopy, ...AUDIT_NA_COPY } : baseCopy;
  const saveDisabled = mode === 'na' ? !value.trim() : value.trim() === saved;
  const removing = mode === 'remark' && !!saved && !value.trim();

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{copy.title}</DialogTitle>
          <DialogDescription className="t-meta">{item.label}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Textarea
            id={`item-note-${item.id}`}
            label={mode === 'remark' && missing ? "This item is overdue. Say why it isn't done yet." : copy.hint}
            labelClassName="font-medium"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={copy.placeholder}
            className="min-h-0 px-3 py-2 rounded-lg resize-none"
          />
          {removing && <span className="t-meta text-text-light">Saving an empty box removes the remark.</span>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">Cancel</Button>
          </DialogClose>
          <Button type="button" variant="primary" size="sm" onClick={save} disabled={saveDisabled} isLoading={mutation.isPending}>
            {removing ? 'Remove remark' : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ItemRemarksField = memo(function ItemRemarksField({ item, instanceId, required, canEdit }: ItemRemarksFieldProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const closeDialog = useCallback(() => setMode(null), []);

  const saved = item.remarks?.trim() ?? '';
  const missing = required && !item.isDone && !saved;
  const auditStarted = item.itemType === 'AUDIT' && item.submissions.some((s) => s.isDone);
  const canMarkNa = canEdit && !item.isDone && !auditStarted;

  if (item.isNotApplicable) return null;
  if (!canEdit && !saved) return null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {saved && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-hover/60 border border-border/50">
            <MessageSquare size={13} className="text-text-light shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 t-meta text-text-secondary leading-relaxed whitespace-pre-wrap break-words">{saved}</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setMode('remark')}
                aria-label="Edit remark"
                title="Edit remark"
                className="relative flex items-center justify-center size-7 shrink-0 rounded-md text-text-light hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-2 sm:after:inset-0 after:content-['']"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        )}

        {canEdit && (!saved || canMarkNa) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {!saved && (
              <button
                type="button"
                onClick={() => setMode('remark')}
                className={`inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
                  missing
                    ? 'bg-danger/10 text-danger hover:bg-danger/15 border border-danger/25'
                    : 'bg-surface-hover/70 text-text-muted hover:text-text hover:bg-surface-hover border border-transparent'
                }`}
              >
                {missing ? <MessageSquareWarning size={13} /> : <MessageSquare size={13} />}
                {missing ? 'Add reason (overdue)' : 'Add remark'}
              </button>
            )}
            {canMarkNa && (
              <button
                type="button"
                onClick={() => setMode('na')}
                className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full border border-border-hover t-meta font-display font-semibold text-text-muted hover:text-text hover:border-text-light transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
              >
                <Ban size={13} />
                Not applicable
              </button>
            )}
          </div>
        )}
      </div>

      {mode !== null && (
        <RemarkDialog
          item={item}
          instanceId={instanceId}
          mode={mode}
          saved={saved}
          missing={missing}
          onClose={closeDialog}
        />
      )}
    </>
  );
});
