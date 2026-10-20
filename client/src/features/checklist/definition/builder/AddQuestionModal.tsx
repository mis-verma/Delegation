import { useState, type FormEvent } from 'react';
import { Plus, Type, SlidersHorizontal } from 'lucide-react';
import { Modal, Button, Input } from '../../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { DETAIL_HEADING_CLASS } from '../../../tasks/taskFormFieldStyles';
import { ItemTypeConfigFields } from './ItemTypeConfigFields';
import { draftProblem } from '../../questionTypes/model';
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
  const problem = draftProblem(draft, { storePersonIds: null });
  const canConfirm = hasLabel && problem === null;

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canConfirm) return;
    onConfirm(draft);
  };

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
          <Button type="button" variant="outline" size="md" onClick={handleClose} className="w-full sm:w-auto pointer-coarse:h-11">
            Cancel
          </Button>
          <Button type="button" variant="primary" size="md" onClick={() => handleSubmit()} disabled={!canConfirm} className="w-full sm:w-auto pointer-coarse:h-11">
            <Plus size={15} />
            <span>Add question</span>
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        <Input
          id="quick-add-label"
          autoFocus
          type="text"
          icon={Type}
          label={<>Question <span className="text-danger">*</span></>}
          labelClassName={`${DETAIL_HEADING_CLASS} tracking-normal font-medium px-0 t-meta sm:text-sm`}
          value={draft.label}
          onChange={(e) => patchDraft({ label: e.target.value })}
          placeholder="e.g. Is the cash drawer counted and locked?"
          className="h-11 rounded-lg px-3.5 t-card font-display font-medium border-transparent bg-surface-hover/50 placeholder:font-normal hover:bg-surface-hover focus:bg-surface"
        />

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

        {hasLabel && problem && (
          <p role="alert" className="t-meta font-display font-medium text-danger">{problem}</p>
        )}
      </form>
    </Modal>
  );
};
