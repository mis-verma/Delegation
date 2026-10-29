import { useState, type FormEvent } from 'react';
import { Plus, Type, SlidersHorizontal } from 'lucide-react';
import { Modal, Button, Input, AddChip } from '../../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { DETAIL_HEADING_CLASS } from '../../../tasks/taskFormFieldStyles';
import { ItemTypeConfigFields } from './ItemTypeConfigFields';
import { BuilderSection } from './BuilderSection';
import { draftProblem } from '../../questionTypes/model';
import { QuestionTypeMenu } from './QuestionTypeMenu';
import { questionTypeOf } from './questionTypes';
import { emptyItemDraft, patchForEntry, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import type { PaletteEntry } from './QuestionTypePalette';

const SUGGESTIONS: Partial<Record<string, string[]>> = {
  YES_NO: ['Is the store clean and tidy?', 'Are all showcases locked?', 'Is the cash drawer counted?'],
  PASS_FAIL: ['Is the alarm system working?', 'Are the fire exits clear?', 'Is the CCTV recording?'],
  CHECKBOX: ['Lights switched on', 'Showcase display arranged', 'Price tags checked'],
  PHOTO: ['Photo of the main showcase', 'Photo of the store entrance', 'Photo of the locked safe'],
  TEXT_BOX: ['Any issue to report today?', 'Notes for the next shift'],
  NUMBER_ENTRY: ['Fridge temperature', 'Opening gold rate noted'],
  RATING: ['How clean is the store?', 'How was customer footfall?'],
};

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
      size="lg"
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1">
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-linear-to-r from-primary-500/[0.09] via-primary-500/[0.03] to-transparent p-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <Icon size={22} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="t-card font-display font-bold text-text">{type.label}</span>
            <span className="t-meta text-text-muted">{type.hint}</span>
          </div>
          <QuestionTypeMenu draft={draft} onPick={(next) => patchDraft(patchForEntry(draft, next))} />
        </div>

        <div className="flex flex-col gap-2">
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
            className="h-12 rounded-xl px-3.5 t-card font-display font-medium border-transparent bg-surface-hover/50 placeholder:font-normal hover:bg-surface-hover focus:bg-surface"
          />
          {!hasLabel && (SUGGESTIONS[type.id]?.length ?? 0) > 0 && (
            <div role="group" aria-label="Question ideas" className="flex flex-wrap gap-1.5">
              {SUGGESTIONS[type.id]?.map((idea) => (
                <AddChip key={idea} onClick={() => patchDraft({ label: idea })}>{idea}</AddChip>
              ))}
            </div>
          )}
        </div>

        <BuilderSection icon={SlidersHorizontal} title="Settings" hint="How this question behaves for your staff.">
          <ItemTypeConfigFields draft={draft} onChange={patchDraft} storeIds={storeIds} />
        </BuilderSection>

        {hasLabel && problem && (
          <p role="alert" className="t-meta font-display font-medium text-danger">{problem}</p>
        )}
      </form>
    </Modal>
  );
};
