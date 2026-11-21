import { memo, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, Smartphone } from 'lucide-react';
import { QuestionPhonePreview } from './builder/QuestionPhonePreview';
import { cn } from '@/lib/utils';
import { Collapse, PANEL_CLASS } from '../../../components';
import { QuestionSummaryChips } from './builder/QuestionSummaryChips';
import { ItemTypeConfigFields } from './builder/ItemTypeConfigFields';
import { draftProblem, patchForTypeSwitch } from '../questionTypes/model';
import { QuestionTypeMenu } from './builder/QuestionTypeMenu';
import { GROUP_ACCENT, GROUP_TILE, questionTypeOf, type QuestionTypeEntry } from './builder/questionTypes';
import type { ChecklistItemType, ChecklistConditionalAction } from '../../../api/checklistDefinitions';

export type ItemDraft = {
  key: string;
  section: string | null;
  label: string;
  requiredImageCount: string;
  maxImageCount: string;
  requiresLivePhoto: boolean;
  referenceImageUrl: string;
  isCritical: boolean;
  allowNotApplicable: boolean;
  itemType: ChecklistItemType;
  auditUserIds: string[];
  accessories: string[];
  accessoriesFemale: string[];
  accessoriesMale: string[];
  accessoriesByType: Record<string, string[]>;
  criticalAccessories: string[];
  accessoryPoints: Record<string, number>;
  auditPhotoOnlyOnMiss: boolean;
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
  referenceImageUrl: '',
  isCritical: false,
  allowNotApplicable: true,
  itemType: 'STANDARD',
  auditUserIds: [],
  accessories: [],
  accessoriesFemale: [],
  accessoriesMale: [],
  accessoriesByType: {},
  criticalAccessories: [],
  accessoryPoints: {},
  auditPhotoOnlyOnMiss: false,
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
  /** Closed rows show a one-line summary so a long checklist stays readable and easy to drag. */
  open?: boolean;
  onToggleOpen?: () => void;
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
  open = true,
  onToggleOpen,
}: ChecklistDefinitionItemDraftRowProps) => {
  const [previewing, setPreviewing] = useState(false);
  const patch = (p: Partial<ItemDraft>) => onChange(draft.key, p);
  const type = questionTypeOf(draft);
  const TypeIcon = type.icon;
  const isLabelBlank = !draft.label.trim();
  const problem = isLabelBlank ? 'Type the question staff will see. Without one it won’t be saved.' : draftProblem(draft, { storePersonIds: validPersonIds ?? null });
  const problemId = `item-problem-${draft.key}`;
  const pickType = (entry: QuestionTypeEntry) => patch(patchForEntry(draft, entry));
  const bodyId = `item-body-${draft.key}`;

  const collapsible = !!onToggleOpen;

  return (
    <article
      aria-label={`Question ${index + 1}`}
      data-question-key={draft.key}
      className={cn(
        PANEL_CLASS,
        'group/q relative flex flex-col overflow-hidden transition-[border-color,box-shadow,background-color] duration-200 ease-out',
        problem ? 'border-danger/40' : 'hover:border-border-hover focus-within:border-primary-400/70',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1 transition-colors duration-200 ease-out',
          problem ? 'bg-danger' : GROUP_ACCENT[type.group],
        )}
      />

      {collapsible && (
        <div className="flex items-center gap-2 py-1.5 pl-2.5 pr-1.5">
          <div className="flex shrink-0 items-center">{leading}</div>
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? `Collapse question ${index + 1}` : `Open question ${index + 1}`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 text-left cursor-pointer outline-none transition-colors duration-150 ease-out hover:bg-surface-hover/50 focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <span className="w-5 shrink-0 t-meta font-display font-bold tabular-nums text-text-light">{index + 1}</span>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ease-out group-hover/q:scale-105',
                GROUP_TILE[type.group],
              )}
              aria-hidden="true"
            >
              <TypeIcon size={14} strokeWidth={2.25} />
            </span>
            {/* text-sm, not t-card: t-card sets text-wrap balance, which cancels the truncate. */}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm font-display font-semibold transition-opacity duration-200 ease-out motion-reduce:transition-none',
                open && 'opacity-0',
                isLabelBlank ? 'font-medium italic text-text-light' : 'text-text',
              )}
            >
              {draft.label.trim() || 'Untitled question'}
            </span>
            {problem && !open && <AlertCircle size={14} className="shrink-0 text-danger" aria-label="Needs attention" />}
            <span className={cn('hidden shrink-0 t-meta font-display font-medium text-text-muted transition-opacity duration-200 sm:inline', open && 'opacity-0')}>
              {type.label}
            </span>
            <ChevronDown
              size={15}
              aria-hidden
              className={cn(
                'shrink-0 text-text-light transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </button>
          <div className="shrink-0">{trailing}</div>
        </div>
      )}

      <Collapse open={!collapsible || open} id={bodyId}>
      <div
        className={cn(
          'grid items-start gap-x-1 gap-y-2 sm:gap-x-3 p-2.5 sm:p-4 sm:pr-2',
          collapsible
            ? 'grid-cols-1 pt-0 sm:pt-0'
            : 'grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]',
        )}
      >
        {!collapsible && (
          <>
            <div className="col-start-1 row-start-1 flex items-center">{leading}</div>
            <span className="col-start-2 row-start-1 self-center sm:hidden t-meta font-display font-medium text-text-muted tabular-nums" aria-hidden="true">
              Question {index + 1}
            </span>
            <span className={`hidden sm:flex col-start-2 row-start-1 items-center justify-center size-10 rounded-lg ${GROUP_TILE[type.group]}`} aria-hidden="true">
              <TypeIcon size={18} strokeWidth={2.25} />
            </span>
          </>
        )}

        <div className={cn('flex flex-col gap-3 min-w-0', !collapsible && 'col-span-3 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1')}>
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
            <div className="hidden sm:flex shrink-0 items-center gap-1.5 pt-3">
              <button type="button" onClick={() => setPreviewing(true)} aria-label="Preview this question on a phone" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-surface px-2.5 t-meta font-display font-semibold text-text-secondary cursor-pointer transition-colors duration-150 hover:border-primary-400 hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"><Smartphone size={13} aria-hidden />Preview</button>
              <QuestionTypeMenu draft={draft} onPick={pickType} />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            <QuestionTypeMenu draft={draft} onPick={pickType} />
            <button type="button" onClick={() => setPreviewing(true)} aria-label="Preview this question on a phone" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border/70 bg-surface px-3 t-meta font-display font-semibold text-text-secondary cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"><Smartphone size={14} aria-hidden />Preview</button>
          </div>
          <QuestionSummaryChips draft={draft} />
          <ItemTypeConfigFields draft={draft} onChange={patch} storeIds={storeIds} validPersonIds={validPersonIds} />
          {problem && (
            <p id={problemId} role="alert" className="flex items-start gap-1.5 t-meta font-display font-medium text-danger">
              <AlertCircle size={13} className="shrink-0 mt-px" />
              {problem}
            </p>
          )}
        </div>

        {!collapsible && <div className="col-start-3 row-start-1 sm:col-start-4 justify-self-end">{trailing}</div>}
      </div>
      </Collapse>
      {previewing && <QuestionPhonePreview draft={draft} open onClose={() => setPreviewing(false)} />}
    </article>
  );
};

export const ChecklistDefinitionItemDraftRow = memo(ChecklistDefinitionItemDraftRowImpl);
