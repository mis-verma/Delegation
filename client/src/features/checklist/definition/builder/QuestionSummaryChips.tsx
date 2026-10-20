import { Flag, Target, Zap } from 'lucide-react';
import { IconChip } from '../../../../components';
import { isScorableType } from '../../questionTypes/model';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

export const QuestionSummaryChips = ({ draft }: { draft: ItemDraft }) => {
  const rules = draft.yesActions.length + draft.noActions.length;
  const scored = isScorableType(draft.itemType) && (draft.acceptableAnswers.length > 0 || draft.acceptableMin !== '' || draft.acceptableMax !== '');
  const chips = [
    rules > 0 && <IconChip key="rules" icon={Zap} tone="bg-warning" label={`${rules} ${rules === 1 ? 'rule' : 'rules'}`} />,
    scored && <IconChip key="scored" icon={Target} tone="bg-primary-600" label="Scored" />,
    draft.isCritical && <IconChip key="critical" icon={Flag} tone="bg-danger" label="Critical" />,
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return <div aria-label="Question settings" className="flex flex-wrap gap-1.5">{chips}</div>;
};
