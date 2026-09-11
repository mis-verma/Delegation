import { useState } from 'react';
import { Zap, ChevronRight, Check, X, AlertCircle } from 'lucide-react';
import type { ChecklistConditionalAction } from '../../../../api/checklistDefinitions';

const TRIGGER_LABELS: Record<'YES_NO' | 'PASS_FAIL', { yes: string; no: string }> = {
  YES_NO: { yes: 'Yes', no: 'No' },
  PASS_FAIL: { yes: 'Pass', no: 'Fail' },
};

const ACTION_OPTIONS: { value: ChecklistConditionalAction; label: string }[] = [
  { value: 'REQUIRE_PHOTO', label: 'Photo mandatory' },
  { value: 'ASK_REASON', label: 'Ask reason' },
  { value: 'CREATE_ISSUE', label: 'Create issue' },
  { value: 'NOTIFY_AREA_MANAGER', label: 'Notify Area Manager' },
];

type Branch = 'YES' | 'NO';

interface ConditionalLogicPanelProps {
  itemType: 'YES_NO' | 'PASS_FAIL';
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
  onYesActionsChange: (actions: ChecklistConditionalAction[]) => void;
  onNoActionsChange: (actions: ChecklistConditionalAction[]) => void;
  className?: string;
}

const summarize = (actions: ChecklistConditionalAction[]) =>
  actions.map((a) => ACTION_OPTIONS.find((o) => o.value === a)?.label).filter(Boolean).join(', ');

// One rule row per branch (Yes/Pass and No/Fail) — both can be armed on the same item at once,
// e.g. "If Yes -> require photo" AND "If No -> ask reason" simultaneously, since the two action
// sets are independent (see ChecklistDefinitionItem.yesActions/noActions).
const RuleRow = ({
  label,
  actions,
  onChange,
  onRemove,
}: {
  label: string;
  actions: ChecklistConditionalAction[];
  onChange: (actions: ChecklistConditionalAction[]) => void;
  onRemove: () => void;
}) => {
  const toggleAction = (action: ChecklistConditionalAction) => {
    onChange(actions.includes(action) ? actions.filter((a) => a !== action) : [...actions, action]);
  };
  const activeSummary = actions.length ? summarize(actions) : null;

  return (
    <div className="flex flex-col gap-2.5 p-2.5 rounded-lg bg-surface border border-border/80 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-display text-text-secondary flex-wrap">
          <span className="font-medium text-text">If answer is</span>
          <span className="px-2 py-0.5 rounded bg-warning/15 text-warning font-bold">{label}</span>
          <ChevronRight size={13} className="text-text-muted shrink-0" />
          <span className="font-medium text-text">then trigger:</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50 shrink-0"
          aria-label={`Remove ${label} rule`}
          title="Remove this rule"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTION_OPTIONS.map((opt) => {
          const isChecked = actions.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleAction(opt.value)}
              aria-pressed={isChecked}
              className={[
                'group/chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-display font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50',
                isChecked
                  ? 'border-warning/50 bg-warning/15 text-warning shadow-2xs font-semibold'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border/80 hover:text-text',
              ].join(' ')}
            >
              <span
                className={[
                  'flex items-center justify-center size-3.5 rounded-full border transition-all duration-150 shrink-0',
                  isChecked
                    ? 'border-warning bg-warning text-white'
                    : 'border-border bg-transparent group-hover/chip:border-text-muted',
                ].join(' ')}
              >
                {isChecked && <Check size={9} strokeWidth={3.5} />}
              </span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {activeSummary ? (
        <div className="flex items-center gap-1.5 text-[11px] font-display text-warning/80 bg-warning/10 border border-warning/20 rounded-md px-2.5 py-1.5">
          <span>
            Rule: When answered <strong className="font-bold">{label}</strong> &rarr; {activeSummary}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[11px] font-display text-text-muted px-1">
          <AlertCircle size={11} className="shrink-0" />
          <span>Select at least one action above to activate this rule.</span>
        </div>
      )}
    </div>
  );
};

export const ConditionalLogicPanel = ({
  itemType,
  yesActions,
  noActions,
  onYesActionsChange,
  onNoActionsChange,
  className = '',
}: ConditionalLogicPanelProps) => {
  const labels = TRIGGER_LABELS[itemType];

  // Whether a branch's rule row is showing at all is its own bit of state, separate from whether
  // its actions array is non-empty — a freshly added rule starts with zero actions checked (same
  // as unchecking every chip on an existing rule without removing it), and both cases should keep
  // showing the row with its "select at least one action" hint rather than collapsing away.
  // Initialized from whatever the definition already had saved (a non-empty array means the rule
  // was already armed), so opening an existing item's conditional logic still shows its rule(s).
  const [yesAdded, setYesAdded] = useState(yesActions.length > 0);
  const [noAdded, setNoAdded] = useState(noActions.length > 0);
  const hasAnyRule = yesAdded || noAdded;

  const removeBranch = (branch: Branch) => {
    if (branch === 'YES') { setYesAdded(false); onYesActionsChange([]); }
    else { setNoAdded(false); onNoActionsChange([]); }
  };

  if (!hasAnyRule) {
    return (
      <div className={`flex flex-wrap gap-2 mt-2 ${className}`}>
        <button
          type="button"
          onClick={() => setYesAdded(true)}
          className="group/trigger inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-warning/40 bg-warning/10 text-xs font-display font-medium text-warning transition-all duration-150 hover:border-warning/60 hover:bg-warning/20 hover:shadow-xs active:scale-[0.98] cursor-pointer w-fit focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
        >
          <Zap size={13} className="text-warning transition-transform duration-200 group-hover/trigger:scale-110 group-hover/trigger:-rotate-6" />
          <span>If {labels.yes} then...</span>
        </button>
        <button
          type="button"
          onClick={() => setNoAdded(true)}
          className="group/trigger inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-warning/40 bg-warning/10 text-xs font-display font-medium text-warning transition-all duration-150 hover:border-warning/60 hover:bg-warning/20 hover:shadow-xs active:scale-[0.98] cursor-pointer w-fit focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
        >
          <Zap size={13} className="text-warning transition-transform duration-200 group-hover/trigger:scale-110 group-hover/trigger:-rotate-6" />
          <span>If {labels.no} then...</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Conditional logic settings"
      className={`flex flex-col gap-2.5 p-3.5 mt-2.5 rounded-xl bg-warning/10 border border-warning/30 shadow-xs transition-all ${className}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-display font-bold text-warning">
        <Zap size={13} className="text-warning shrink-0" />
        Conditional Logic
      </span>

      {yesAdded && (
        <RuleRow label={labels.yes} actions={yesActions} onChange={onYesActionsChange} onRemove={() => removeBranch('YES')} />
      )}
      {noAdded && (
        <RuleRow label={labels.no} actions={noActions} onChange={onNoActionsChange} onRemove={() => removeBranch('NO')} />
      )}

      {/* Only ever two possible answers, so this offers whichever branch isn't armed yet. */}
      {(!yesAdded || !noAdded) && (
        <button
          type="button"
          onClick={() => (yesAdded ? setNoAdded(true) : setYesAdded(true))}
          className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-display font-medium text-warning hover:bg-warning/15 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
        >
          <Zap size={12} />
          Add condition for {yesAdded ? labels.no : labels.yes}
        </button>
      )}
    </div>
  );
};
