import { useState } from 'react';
import { Zap, Camera, MessageSquareText, TicketPlus, BellRing, Check, Plus, X, Info, TriangleAlert, ShieldAlert, type LucideIcon } from 'lucide-react';
import { Button, IconChip } from '../../../../components';
import { cn } from '@/lib/utils';
import { PhotoSourceChips } from './PhotoRulesPanel';
import type { ChecklistConditionalAction } from '../../../../api/checklistDefinitions';

const TRIGGER_LABELS: Record<'YES_NO' | 'PASS_FAIL', { yes: string; no: string }> = {
  YES_NO: { yes: 'Yes', no: 'No' },
  PASS_FAIL: { yes: 'Pass', no: 'Fail' },
};

const ACTIONS: { value: ChecklistConditionalAction; label: string; hint: string; staff: string; icon: LucideIcon; tone: string }[] = [
  { value: 'REQUIRE_PHOTO', label: 'Needs a photo', hint: 'Staff must attach a photo', staff: 'Photo', icon: Camera, tone: 'bg-primary-600' },
  { value: 'ASK_REASON', label: 'Ask why', hint: 'Staff type a short reason', staff: 'Reason', icon: MessageSquareText, tone: 'bg-coral-500' },
  { value: 'CREATE_ISSUE', label: 'Raise a ticket', hint: 'A ticket is created for you', staff: 'Ticket', icon: TicketPlus, tone: 'bg-warning' },
  { value: 'NOTIFY_AREA_MANAGER', label: 'Alert area manager', hint: 'They are told straight away', staff: 'Alert', icon: BellRing, tone: 'bg-danger' },
];

interface ConditionalLogicPanelProps {
  itemType: 'YES_NO' | 'PASS_FAIL';
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
  onYesActionsChange: (actions: ChecklistConditionalAction[]) => void;
  onNoActionsChange: (actions: ChecklistConditionalAction[]) => void;
  liveOnly?: boolean;
  onLiveOnlyChange?: (live: boolean) => void;
  className?: string;
}

const followUps = (n: number) => (n === 0 ? 'Just saves the answer' : `${n} ${n === 1 ? 'follow-up' : 'follow-ups'}`);

const AnswerCard = ({
  answer,
  tone,
  actions,
  liveOnly,
  onChange,
}: {
  answer: string;
  tone: 'good' | 'bad';
  actions: ChecklistConditionalAction[];
  liveOnly: boolean;
  onChange: (actions: ChecklistConditionalAction[]) => void;
}) => {
  const good = tone === 'good';
  const toggle = (value: ChecklistConditionalAction) => onChange(actions.includes(value) ? actions.filter((a) => a !== value) : [...actions, value]);
  return (
    <div className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface', good ? 'border-success/40' : 'border-danger/40')}>
      <div className={cn('flex items-center gap-3 border-b px-3 py-2.5', good ? 'border-success/25 bg-success/10' : 'border-danger/25 bg-danger/10')}>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white', good ? 'bg-success' : 'bg-danger')} aria-hidden="true">
          {good ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="t-card font-display font-bold text-text">If the answer is {answer}</span>
          <span className="t-meta font-display text-text-muted">{followUps(actions.length)}</span>
        </span>
      </div>

      <div role="group" aria-label={`When the answer is ${answer}`} className="flex flex-col gap-1.5 p-2.5">
        {ACTIONS.map((action) => {
          const on = actions.includes(action.value);
          const Icon = action.icon;
          return (
            <button
              key={action.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(action.value)}
              className={cn(
                'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-2.5 py-1.5 text-left outline-none transition-colors duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
                on ? (good ? 'border-success/50 bg-success/8' : 'border-danger/50 bg-danger/8') : 'border-border/60 bg-surface hover:border-border-hover',
              )}
            >
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', on ? `${action.tone} text-white` : 'bg-surface-hover text-text-secondary')} aria-hidden="true">
                <Icon size={15} strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-meta font-display font-semibold text-text">{action.label}</span>
                <span className="t-meta text-text-muted">{action.hint}</span>
              </span>
              <span
                className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', on ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-hover')}
                aria-hidden="true"
              >
                {on && <Check size={11} strokeWidth={3.5} />}
              </span>
            </button>
          );
        })}
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-surface-hover/40 px-3 py-2">
          <span className="t-meta font-display font-semibold text-text-muted">Staff will see</span>
          {ACTIONS.filter((a) => actions.includes(a.value)).map((a) => (
            <IconChip key={a.value} icon={a.icon} tone={a.tone} label={a.value === 'REQUIRE_PHOTO' && liveOnly ? 'Live photo' : a.staff} />
          ))}
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
  liveOnly = false,
  onLiveOnlyChange,
  className = '',
}: ConditionalLogicPanelProps) => {
  const labels = TRIGGER_LABELS[itemType];
  const activeCount = yesActions.length + noActions.length;
  const [open, setOpen] = useState(activeCount > 0);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left outline-none transition-colors duration-150 hover:border-primary-400 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
          className,
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning" aria-hidden="true">
          <Zap size={17} strokeWidth={2.25} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-card font-display font-bold text-text">Add follow-up rules</span>
          <span className="t-meta text-text-muted">For example, if {labels.no}, ask why or raise a ticket.</span>
        </span>
        <Plus size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
      </button>
    );
  }

  const bothTrigger = yesActions.length > 0 && noActions.length > 0;
  const goodSideAlerts = yesActions.includes('CREATE_ISSUE') || yesActions.includes('NOTIFY_AREA_MANAGER');
  const flaggedLabel = yesActions.length > 0 && noActions.length === 0 ? labels.yes : noActions.length > 0 && yesActions.length === 0 ? labels.no : null;
  const needsPhoto = yesActions.includes('REQUIRE_PHOTO') || noActions.includes('REQUIRE_PHOTO');

  return (
    <section
      aria-label="Rules for this question"
      className={cn('@container flex flex-col gap-3 rounded-2xl border border-border/60 bg-linear-to-br from-primary-500/[0.05] to-transparent p-3 sm:p-4', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-warning to-warning/70 text-white" aria-hidden="true">
            <Zap size={17} strokeWidth={2.25} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="t-card font-display font-bold text-text">Follow-up rules</span>
            <span className="t-meta text-text-muted">Pick what happens after each answer.</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {activeCount > 0 && <IconChip icon={Check} tone="bg-primary-600" label={`${activeCount} on`} labelClassName="tabular-nums" />}
          {activeCount === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="size-9 px-0 pointer-coarse:size-11 rounded-full" aria-label="Hide rules">
              <X size={15} />
            </Button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <AnswerCard answer={labels.yes} tone="good" actions={yesActions} liveOnly={liveOnly} onChange={onYesActionsChange} />
        <AnswerCard answer={labels.no} tone="bad" actions={noActions} liveOnly={liveOnly} onChange={onNoActionsChange} />
      </div>

      {onLiveOnlyChange && needsPhoto && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface p-3 @md:flex-row @md:items-center @md:gap-3">
          <span className="flex items-center gap-2 t-meta font-display font-semibold text-text-secondary @md:w-28 @md:shrink-0">
            <Camera size={14} className="text-text-light" aria-hidden="true" />
            Photo source
          </span>
          <PhotoSourceChips live={liveOnly} onChange={onLiveOnlyChange} />
        </div>
      )}

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
