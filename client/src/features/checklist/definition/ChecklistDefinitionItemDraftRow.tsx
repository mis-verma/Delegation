import { memo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../../components';
import { ItemTypeConfigFields, itemDraftProblem, patchForTypeSwitch } from './builder/ItemTypeConfigFields';
import { QuestionTypeMenu } from './builder/QuestionTypeMenu';
import { GROUP_TILE, questionTypeOf, type QuestionTypeEntry } from './builder/questionTypes';
import type { ChecklistItemType, ChecklistConditionalAction } from '../../../api/checklistDefinitions';

export type ItemDraft = {
  key: string;
  section: string | null;
  label: string;
  requiredImageCount: string;
  maxImageCount: string;
  requiresLivePhoto: boolean;
  isCritical: boolean;
  itemType: ChecklistItemType;
  auditUserIds: string[];
  accessories: string[];
  accessoriesFemale: string[];
  accessoriesMale: string[];
  accessoriesByType: Record<string, string[]>;
  numberEntryUnit: string;
  numberEntryMin: string;
  numberEntryMax: string;
  ratingScale: string;
  options: string[];
  gpsTargetLat: string;
  gpsTargetLng: string;
  gpsRadiusMeters: string;
  qrExpectedValue: string;
  cashExpectedAmount: string;
  acceptableAnswers: string[];
  acceptableMin: string;
  acceptableMax: string;
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
};

// eslint-disable-next-line react-refresh/only-export-components
export const emptyItemDraft = (): ItemDraft => ({
  key: crypto.randomUUID(),
  section: null,
  label: '',
  requiredImageCount: '0',
  maxImageCount: '',
  requiresLivePhoto: false,
  isCritical: false,
  itemType: 'STANDARD',
  auditUserIds: [],
  accessories: [],
  accessoriesFemale: [],
  accessoriesMale: [],
  accessoriesByType: {},
  numberEntryUnit: '',
  numberEntryMin: '',
  numberEntryMax: '',
  ratingScale: '5',
  options: [],
  gpsTargetLat: '',
  gpsTargetLng: '',
  gpsRadiusMeters: '',
  qrExpectedValue: '',
  cashExpectedAmount: '',
  acceptableAnswers: [],
  acceptableMin: '',
  acceptableMax: '',
  yesActions: [],
  noActions: [],
});

// eslint-disable-next-line react-refresh/only-export-components
export const patchForEntry = (draft: ItemDraft, entry: QuestionTypeEntry): Partial<ItemDraft> => {
  const itemType = entry.patch.itemType ?? 'STANDARD';
  const patch: Partial<ItemDraft> = { ...patchForTypeSwitch(draft, itemType), ...entry.patch };
  if (entry.id === 'CHECKBOX') Object.assign(patch, { maxImageCount: '', requiresLivePhoto: false });
  return patch;
};

interface ChecklistDefinitionItemDraftRowProps {
  index: number;
  draft: ItemDraft;
  onChange: (key: string, patch: Partial<ItemDraft>) => void;
  storeIds?: string[];
  validPersonIds?: ReadonlySet<string> | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

const ChecklistDefinitionItemDraftRowImpl = ({
  index,
  draft,
  onChange,
  storeIds,
  validPersonIds,
  leading,
  trailing,
  className = '',
}: ChecklistDefinitionItemDraftRowProps) => {
  const patch = (p: Partial<ItemDraft>) => onChange(draft.key, p);
  const type = questionTypeOf(draft);
  const TypeIcon = type.icon;
  const isLabelBlank = !draft.label.trim();
  const problem = isLabelBlank ? 'Type the question staff will see. Without one it won’t be saved.' : itemDraftProblem(draft, validPersonIds);
  const problemId = `item-problem-${draft.key}`;
  const pickType = (entry: QuestionTypeEntry) => patch(patchForEntry(draft, entry));

  return (
    <article
      aria-label={`Question ${index + 1}`}
      className={cn(
        PANEL_CLASS,
        'group/q flex flex-col transition-colors duration-150',
        problem ? 'border-danger/40' : 'hover:border-border-hover focus-within:border-primary-400/70',
        className,
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-x-1 gap-y-2 sm:gap-x-3 p-2.5 sm:p-4 sm:pr-2">
        <div className="col-start-1 row-start-1 flex items-center">{leading}</div>
        <span className="col-start-2 row-start-1 self-center sm:hidden t-meta font-display font-medium text-text-muted tabular-nums" aria-hidden="true">
          Question {index + 1}
        </span>
        <span className={`hidden sm:flex col-start-2 row-start-1 items-center justify-center size-10 rounded-lg ${GROUP_TILE[type.group]}`} aria-hidden="true">
          <TypeIcon size={18} strokeWidth={2.25} />
        </span>

        <div className="col-span-3 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <label htmlFor={`item-label-${draft.key}`} className="sr-only sm:not-sr-only t-meta font-display font-medium text-text-muted tabular-nums">
                Question {index + 1}
              </label>
              <textarea
                id={`item-label-${draft.key}`}
                rows={1}
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Type the question staff will see"
                aria-invalid={isLabelBlank}
                aria-describedby={problem ? problemId : undefined}
                className="w-full resize-none field-sizing-content min-h-7 -mx-1.5 px-1.5 py-0.5 rounded-md bg-transparent t-card leading-snug font-display font-semibold text-text placeholder:font-medium placeholder:text-text-light hover:bg-surface-hover/60 focus:bg-surface-hover/60 focus:outline-none transition-colors duration-150"
              />
            </div>
            <div className="hidden sm:block shrink-0 pt-3">
              <QuestionTypeMenu draft={draft} onPick={pickType} />
            </div>
          </div>

          <div className="sm:hidden">
            <QuestionTypeMenu draft={draft} onPick={pickType} />
          </div>
          <ItemTypeConfigFields draft={draft} onChange={patch} storeIds={storeIds} validPersonIds={validPersonIds} />
          {problem && (
            <p id={problemId} role="alert" className="flex items-start gap-1.5 text-xs font-display font-medium text-danger">
              <AlertCircle size={13} className="shrink-0 mt-px" />
              {problem}
            </p>
          )}
        </div>

        <div className="col-start-3 row-start-1 sm:col-start-4 justify-self-end">{trailing}</div>
      </div>
    </article>
  );
};

export const ChecklistDefinitionItemDraftRow = memo(ChecklistDefinitionItemDraftRowImpl);
