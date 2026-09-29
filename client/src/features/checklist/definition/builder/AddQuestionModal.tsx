import { useState, type FormEvent } from 'react';
import { Plus, Type, SlidersHorizontal } from 'lucide-react';
import { Modal, Button } from '../../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { DETAIL_HEADING_CLASS } from '../../../tasks/taskFormFieldStyles';
import { ItemTypeConfigFields, itemDraftProblem } from './ItemTypeConfigFields';
import { QuestionTypeMenu } from './QuestionTypeMenu';
import { questionTypeOf } from './questionTypes';
import { emptyItemDraft, patchForEntry, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import type { PaletteEntry } from './QuestionTypePalette';

interface AddQuestionModalProps {
  entry: PaletteEntry;
  storeIds?: string[];
  onClose: () => void;
  onConfirm: (patch: Partial<ItemDraft>) => void;
}

// Laid out like the New Delegation / New Ticket pop-ups: an icon-led "Question" heading over a
// quiet field, then a "Details" row whose first chip is the question type itself — so the type can
// still be changed here without closing and reopening from the palette.
export const AddQuestionModal = ({
  entry,
  storeIds,
  onClose,
  onConfirm,
}: AddQuestionModalProps) => {
  const [draft, setDraft] = useState<ItemDraft>(() => ({
    ...emptyItemDraft(),
    ...entry.patch,
    label: '',
  }));

  const type = questionTypeOf(draft);
  const Icon = type.icon;
  const patchDraft = (patch: Partial<ItemDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const hasLabel = Boolean(draft.label.trim());
  const problem = itemDraftProblem(draft);
  const canConfirm = hasLabel && problem === null;

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canConfirm) return;
    onConfirm(draft);
  };

  // Escape/overlay-click and the shared Modal's own close button all funnel through the same
  // onOpenChange -> onClose path with no distinction between them — so without this, typing a
  // question and tapping outside the modal (or hitting Escape) silently threw it away.
  const confirm = useConfirm();
  const handleClose = async () => {
    if (hasLabel) {
      const ok = await confirm({
        title: 'Discard this question?',
        description: 'What you\'ve entered here hasn\'t been added to the checklist yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title="New question"
      description={type.hint}
      icon={<Icon size={18} strokeWidth={2.25} />}
      size="md"
      draggable
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 w-full">
          <Button type="button" variant="outline" size="md" onClick={handleClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="button" variant="primary" size="md" onClick={() => handleSubmit()} disabled={!canConfirm} className="w-full sm:w-auto">
            <Plus size={15} />
            <span>Add question</span>
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quick-add-label" className={DETAIL_HEADING_CLASS}>
            <Type size={14} className="text-text-light" />
            Question <span className="text-danger">*</span>
          </label>
          <input
            id="quick-add-label"
            autoFocus
            type="text"
            value={draft.label}
            onChange={(e) => patchDraft({ label: e.target.value })}
            placeholder="e.g. Is the cash drawer counted and locked?"
            className="w-full h-11 px-3.5 text-[15px] font-display font-medium text-text rounded-xl border border-transparent bg-surface-hover/50 placeholder:font-normal placeholder:text-text-light transition-colors duration-150 hover:bg-surface-hover focus:bg-surface focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className={DETAIL_HEADING_CLASS}>
            <SlidersHorizontal size={14} className="text-text-light" />
            Details
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <QuestionTypeMenu draft={draft} onPick={(next) => patchDraft(patchForEntry(draft, next))} />
          </div>
          <ItemTypeConfigFields draft={draft} onChange={patchDraft} storeIds={storeIds} />
        </div>

        {/* Only after something's typed — an empty form isn't an error yet. */}
        {hasLabel && problem && (
          <p role="alert" className="text-xs font-display font-medium text-danger">{problem}</p>
        )}
      </form>
    </Modal>
  );
};
