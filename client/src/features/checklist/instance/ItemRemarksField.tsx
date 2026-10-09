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
  /** The run is overdue and this item isn't done: a reason is needed, so the chip asks for one. */
  required: boolean;
  /** canWork && !isLocked. Without it the saved remark still shows, read-only (reviewers). */
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

// An audit question waved off as a whole: nobody's left to check, so the wording says so.
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

// The pop-up itself. Only mounted while open, so the dozens of closed items on a long checklist
// don't each carry a Radix dialog, a mutation observer and a confirm hook.
const RemarkDialog = ({ item, instanceId, mode, saved, missing, onClose }: RemarkDialogProps) => {
  const [value, setValue] = useState(saved);
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);
  const confirm = useConfirm();
  const dirty = value.trim() !== saved;

  // Escape, overlay click and Cancel all come through here; typed text is never thrown away
  // without asking.
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
    // Empty saves as a clear (null), so a remark can be removed, not only replaced.
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
          <DialogDescription className="text-xs">{item.label}</DialogDescription>
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

/**
 * The note row under every checklist item, audit questions included. On an audit this note is about
 * the question as a whole; each person's own remark still lives inside the audit card.
 *
 * The saved remark is shown as text on the card, not hidden behind a chip. It used to render only
 * while the item was unticked, so ticking it made the remark disappear for everyone, reviewers
 * included, who never saw it at all. Now: visible whenever it exists, editable or clearable while
 * the run is open, and the same row offers "Not applicable" for a step that doesn't apply.
 */
export const ItemRemarksField = memo(function ItemRemarksField({ item, instanceId, required, canEdit }: ItemRemarksFieldProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const closeDialog = useCallback(() => setMode(null), []);

  const saved = item.remarks?.trim() ?? '';
  const missing = required && !item.isDone && !saved;
  // An audit can be waved off as a whole only while nobody's been checked yet: doing it over people
  // who were really audited would throw those checks away (the server refuses too).
  const auditStarted = item.itemType === 'AUDIT' && item.submissions.some((s) => s.isDone);
  const canMarkNa = canEdit && !item.isDone && !auditStarted;

  // N/A items show their reason on their own card (NotApplicableItemCard).
  if (item.isNotApplicable) return null;
  if (!canEdit && !saved) return null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {saved && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-hover/60 border border-border/50">
            <MessageSquare size={13} className="text-text-light shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">{saved}</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setMode('remark')}
                aria-label="Edit remark"
                title="Edit remark"
                // The after: layer pads the 28px button out to a 44px hit area without growing the row.
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
                className={`inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
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
                className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full border border-border-hover text-xs font-display font-semibold text-text-muted hover:text-text hover:border-text-light transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
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
