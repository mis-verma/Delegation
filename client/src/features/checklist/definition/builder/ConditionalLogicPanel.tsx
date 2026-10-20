import { useState } from 'react';
import { Zap, Camera, MessageSquareText, TicketPlus, BellRing, Check, ArrowRight, X, Info, TriangleAlert, ShieldAlert, type LucideIcon } from 'lucide-react';
import { AddChip, Button, IconChip, ToggleChip } from '../../../../components';
import type { ChecklistConditionalAction } from '../../../../api/checklistDefinitions';

const TRIGGER_LABELS: Record<'YES_NO' | 'PASS_FAIL', { yes: string; no: string }> = {
  YES_NO: { yes: 'Yes', no: 'No' },
  PASS_FAIL: { yes: 'Pass', no: 'Fail' },
};

const ACTIONS: { value: ChecklistConditionalAction; label: string; staff: string; icon: LucideIcon; tone: string }[] = [
  { value: 'REQUIRE_PHOTO', label: 'Needs a photo', staff: 'Photo', icon: Camera, tone: 'bg-primary-600' },
  { value: 'ASK_REASON', label: 'Ask why', staff: 'Reason', icon: MessageSquareText, tone: 'bg-coral-500' },
  { value: 'CREATE_ISSUE', label: 'Raise a ticket', staff: 'Ticket', icon: TicketPlus, tone: 'bg-warning' },
  { value: 'NOTIFY_AREA_MANAGER', label: 'Alert area manager', staff: 'Alert', icon: BellRing, tone: 'bg-danger' },
];

interface ConditionalLogicPanelProps {
  itemType: 'YES_NO' | 'PASS_FAIL';
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
  onYesActionsChange: (actions: ChecklistConditionalAction[]) => void;
  onNoActionsChange: (actions: ChecklistConditionalAction[]) => void;
  className?: string;
}

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
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
    <span className="flex shrink-0 items-center gap-1.5 sm:w-28">
      <span className="text-xs font-display text-text-muted">If</span>
      <IconChip icon={tone === 'good' ? Check : X} tone={tone === 'good' ? 'bg-success' : 'bg-danger'} label={answer} />
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

const Outcome = ({ answer, tone, actions }: { answer: string; tone: 'good' | 'bad'; actions: ChecklistConditionalAction[] }) => (
  <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-surface p-2.5">
    <span className={`flex h-9 items-center justify-center rounded-lg border t-card font-display font-semibold ${tone === 'good' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
      {answer}
    </span>
    {actions.length === 0 ? (
      <span className="t-meta font-display text-text-muted">Just saves the answer.</span>
    ) : (
      <span className="flex flex-wrap gap-1">
        {ACTIONS.filter((a) => actions.includes(a.value)).map((a) => (
          <IconChip key={a.value} icon={a.icon} tone={a.tone} label={a.staff} />
        ))}
      </span>
    )}
  </li>
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

  const bothTrigger = yesActions.length > 0 && noActions.length > 0;
  const goodSideAlerts = yesActions.includes('CREATE_ISSUE') || yesActions.includes('NOTIFY_AREA_MANAGER');
  const flaggedLabel = yesActions.length > 0 && noActions.length === 0 ? labels.yes : noActions.length > 0 && yesActions.length === 0 ? labels.no : null;

  return (
    <section
      aria-label="Rules for this question"
      className={`flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-hover/50 p-3 sm:p-3.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <IconChip icon={Zap} tone="bg-warning" label="Rules" />
          {activeCount > 0 && <IconChip icon={Check} tone="bg-primary-600" label={`${activeCount} on`} labelClassName="tabular-nums" />}
        </span>
        {activeCount === 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="size-7 px-0 pointer-coarse:size-11 rounded-full" aria-label="Hide rules">
            <X size={14} />
          </Button>
        )}
      </div>
      <RuleRow answer={labels.yes} tone="good" actions={yesActions} onChange={onYesActionsChange} />
      <RuleRow answer={labels.no} tone="bad" actions={noActions} onChange={onNoActionsChange} />

      <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
        <span className="t-meta font-display font-semibold text-text-secondary">What staff will see</span>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Outcome for each answer">
          <Outcome answer={labels.yes} tone="good" actions={yesActions} />
          <Outcome answer={labels.no} tone="bad" actions={noActions} />
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        {flaggedLabel && (
          <p className="flex items-start gap-1.5 t-meta font-display text-text-secondary">
            <ShieldAlert size={14} className="mt-px shrink-0 text-danger" aria-hidden="true" />
            Answering {flaggedLabel} counts against compliance, even with a reason or photo.
          </p>
        )}
        {bothTrigger && (
          <p className="flex items-start gap-1.5 t-meta font-display text-text-secondary">
            <Info size={14} className="mt-px shrink-0 text-primary-600" aria-hidden="true" />
            Both answers have rules, so neither one counts against compliance. Staff always see a follow-up.
          </p>
        )}
        {goodSideAlerts && (
          <p className="flex items-start gap-1.5 t-meta font-display text-warning">
            <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
            A ticket or alert on {labels.yes} is unusual. Check this is what you want.
          </p>
        )}
      </div>
    </section>
  );
};
