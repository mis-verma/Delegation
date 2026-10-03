import { useState } from 'react';
import { Zap, Camera, MessageSquareText, TicketPlus, BellRing, Check, ArrowRight, X, type LucideIcon } from 'lucide-react';
import { AddChip, Button, ToggleChip } from '../../../../components';
import type { ChecklistConditionalAction } from '../../../../api/checklistDefinitions';

const TRIGGER_LABELS: Record<'YES_NO' | 'PASS_FAIL', { yes: string; no: string }> = {
  YES_NO: { yes: 'Yes', no: 'No' },
  PASS_FAIL: { yes: 'Pass', no: 'Fail' },
};

const ACTIONS: { value: ChecklistConditionalAction; label: string; icon: LucideIcon }[] = [
  { value: 'REQUIRE_PHOTO', label: 'Needs a photo', icon: Camera },
  { value: 'ASK_REASON', label: 'Ask why', icon: MessageSquareText },
  { value: 'CREATE_ISSUE', label: 'Raise a ticket', icon: TicketPlus },
  { value: 'NOTIFY_AREA_MANAGER', label: 'Alert area manager', icon: BellRing },
];

interface ConditionalLogicPanelProps {
  itemType: 'YES_NO' | 'PASS_FAIL';
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
  onYesActionsChange: (actions: ChecklistConditionalAction[]) => void;
  onNoActionsChange: (actions: ChecklistConditionalAction[]) => void;
  className?: string;
}

// One sentence per answer: "If No → [Needs a photo] [Ask why] …". Both answers' action sets are
// independent (ChecklistDefinitionItem.yesActions/noActions), so each row toggles its own chips.
const RuleRow = ({
  answer,
  tone,
  actions,
  onChange,
}: {
  answer: string;
  tone: 'good' | 'bad';
  actions: ChecklistConditionalAction[];
  onChange: (actions: ChecklistConditionalAction[]) => void;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
    <span className="flex items-center gap-1.5 shrink-0 sm:w-24">
      <span className="text-xs font-display text-text-muted">If</span>
      <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-display font-semibold ${
        tone === 'good' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      }`}>
        {answer}
      </span>
      <ArrowRight size={13} className="text-text-light" aria-hidden="true" />
    </span>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`When the answer is ${answer}`}>
      {ACTIONS.map(({ value, label, icon: Icon }) => {
        const on = actions.includes(value);
        return (
          <ToggleChip
            key={value}
            on={on}
            onClick={() => onChange(on ? actions.filter((a) => a !== value) : [...actions, value])}
          >
            {on ? <Check size={13} strokeWidth={2.75} /> : <Icon size={13} />}
            {label}
          </ToggleChip>
        );
      })}
    </div>
  </div>
);

export const ConditionalLogicPanel = ({
  itemType,
  yesActions,
  noActions,
  onYesActionsChange,
  onNoActionsChange,
  className = '',
}: ConditionalLogicPanelProps) => {
  const labels = TRIGGER_LABELS[itemType];
  const activeCount = yesActions.length + noActions.length;
  // Opens by itself when the question already has rules; otherwise one quiet button keeps the card
  // short until an admin actually wants a rule.
  const [open, setOpen] = useState(activeCount > 0);

  if (!open) {
    return (
      <div className={`w-fit ${className}`}>
        <AddChip onClick={() => setOpen(true)}>
          Add a rule
          <span className="hidden sm:inline font-normal text-text-muted">· e.g. if {labels.no}, ask why</span>
        </AddChip>
      </div>
    );
  }

  return (
    <section
      aria-label="Rules for this question"
      className={`flex flex-col gap-3 p-3 sm:p-3.5 rounded-lg bg-surface-hover/50 border border-border/60 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-display font-semibold text-text">
          <Zap size={13} className="text-warning" />
          Rules
          {activeCount > 0 && <span className="font-normal text-text-muted">· {activeCount} on</span>}
        </span>
        {activeCount === 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="size-7 px-0 pointer-coarse:size-11 rounded-full" aria-label="Hide rules">
            <X size={14} />
          </Button>
        )}
      </div>
      <RuleRow answer={labels.yes} tone="good" actions={yesActions} onChange={onYesActionsChange} />
      <RuleRow answer={labels.no} tone="bad" actions={noActions} onChange={onNoActionsChange} />
    </section>
  );
};
