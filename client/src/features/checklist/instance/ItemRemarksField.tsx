import { useState } from 'react';
import { MessageSquare, MessageSquareWarning, Ban, Pencil } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { Button } from '../../../components';
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

/**
 * The note row under every checklist item (AUDIT items excepted, they keep per-auditor remarks).
 *
 * The saved remark is shown as text on the card, not hidden behind a chip. It used to render only
 * while the item was unticked, so ticking it made the remark disappear for everyone, reviewers
 * included, who never saw it at all. Now: visible whenever it exists, editable or clearable while
 * the run is open, and the same row offers "Not applicable" for a step that doesn't apply.
 */
export const ItemRemarksField = ({ item, instanceId, required, canEdit }: ItemRemarksFieldProps) => {
  const [mode, setMode] = useState<Mode | null>(null);
  const [value, setValue] = useState('');
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);
  const confirm = useConfirm();

  const saved = item.remarks?.trim() ?? '';
  const missing = required && !item.isDone && !saved;
  const canMarkNa = canEdit && !item.isDone && item.itemType !== 'AUDIT';
  const dirty = mode !== null && value.trim() !== saved;

  const openAs = (next: Mode) => {
    setValue(saved);
    setMode(next);
  };

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
    setMode(null);
  };

  const save = () => {
    const text = value.trim();
    if (mode === 'na') {
      mutation.mutate(
        { itemId: item.id, isDone: true, notApplicable: true, remarks: text },
        { onSuccess: () => setMode(null) },
      );
      return;
    }
    // Empty saves as a clear (null), so a remark can be removed, not only replaced.
    mutation.mutate(
      { itemId: item.id, isDone: item.isDone, remarks: text || null },
      { onSuccess: () => setMode(null) },
    );
  };

  // N/A items show their reason on their own card (NotApplicableItemCard).
  if (item.isNotApplicable) return null;
  if (!canEdit && !saved) return null;

  const copy = mode ? COPY[mode] : COPY.remark;
  const saveDisabled = mode === 'na' ? !value.trim() : value.trim() === saved;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {saved && (
          <div className="group/remark flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-hover/60 border border-border/50 dark:border-white/[0.06]">
            <MessageSquare size={13} className="text-text-light shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">{saved}</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => openAs('remark')}
                aria-label="Edit remark"
                title="Edit remark"
                className="flex items-center justify-center size-7 -my-1 -mr-1 rounded-md text-text-light hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
                onClick={() => openAs('remark')}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
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
                onClick={() => openAs('na')}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-dashed border-border-hover text-xs font-display font-semibold text-text-muted hover:text-text hover:border-text-light transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
              >
                <Ban size={13} />
                Not applicable
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={mode !== null} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{copy.title}</DialogTitle>
            <DialogDescription className="text-xs">{item.label}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`item-note-${item.id}`} className="text-[11px] font-display font-medium text-text-muted">
              {mode === 'remark' && missing ? "This item is overdue. Say why it isn't done yet." : copy.hint}
            </label>
            <textarea
              id={`item-note-${item.id}`}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={copy.placeholder}
              className="px-2.5 py-1.5 text-sm font-display bg-surface text-text rounded-md border border-border resize-none placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors duration-150"
            />
            {mode === 'remark' && saved && !value.trim() && (
              <span className="text-[11px] text-text-light">Saving an empty box removes the remark.</span>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button type="button" variant="primary" size="sm" onClick={save} disabled={saveDisabled} isLoading={mutation.isPending}>
              {mode === 'remark' && saved && !value.trim() ? 'Remove remark' : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
