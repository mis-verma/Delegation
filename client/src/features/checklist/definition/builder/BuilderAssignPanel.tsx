import { Building2, User, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChecklistAssigneesField } from '../form/ChecklistAssigneesField';
import type { ChecklistResponseMode } from '../../../../api/checklistDefinitions';

interface BuilderAssignPanelProps {
  storeIds: string[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  responseMode: ChecklistResponseMode;
  onResponseModeChange: (mode: ChecklistResponseMode) => void;
}

const MODES: { value: ChecklistResponseMode; title: string; hint: string; icon: ReactNode }[] = [
  { value: 'SHARED', title: 'One shared checklist', hint: 'One per store. Anyone chosen can fill it in.', icon: <Users size={16} /> },
  { value: 'PER_DEPARTMENT', title: 'One per department', hint: 'Each department among the people chosen fills its own.', icon: <Building2 size={16} /> },
  { value: 'PER_USER', title: 'One per person', hint: 'Everyone chosen fills in their own copy.', icon: <User size={16} /> },
];

// Who fills this checklist in, and how many copies of it there are each time it comes round — real
// people only. The "Assign by role" chips that used to sit above this were a fixed list of made-up
// roles (Store Manager, Cashier…) that assigned nobody, so they're gone. Reviewers are their own
// step (BuilderReviewersPanel).
export const BuilderAssignPanel = ({ storeIds, assigneeIds, onAssigneeIdsChange, responseMode, onResponseModeChange }: BuilderAssignPanelProps) => (
  <div className="flex flex-col gap-6">
    <fieldset className="flex flex-col gap-2.5">
      <legend className="text-sm font-display font-semibold text-text pb-1">How many copies?</legend>
      <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-3">
        {MODES.map(m => {
          const on = responseMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onResponseModeChange(m.value)}
              className={`flex flex-col items-start gap-1.5 p-3.5 text-left rounded-xl border cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                on
                  ? 'border-primary-500/60 bg-primary-500/10'
                  : 'border-border/60 bg-surface hover:border-border-hover'
              }`}
            >
              <span className={`flex items-center gap-2 text-sm font-display font-semibold ${on ? 'text-primary-700 dark:text-primary-300' : 'text-text'}`}>
                {m.icon}
                {m.title}
              </span>
              <span className="text-xs font-display text-text-muted leading-relaxed">{m.hint}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
    <ChecklistAssigneesField storeIds={storeIds} selected={assigneeIds} onChange={onAssigneeIdsChange} />
  </div>
);
