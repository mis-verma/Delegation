import { Building2, PauseCircle, User, Users } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { NoticeBanner } from '../../../../components';
import { useAssignableUsersQuery } from '../../hook';
import { ChecklistAssigneesField } from '../form/ChecklistAssigneesField';
import { HiddenPeopleNotice } from './HiddenPeopleNotice';
import { onRadioKeyDown } from './radioGroupKeys';
import { peopleCount, splitByVisible, type StorePeople } from './useStorePeople';
import type { ChecklistResponseMode } from '../../../../api/checklistDefinitions';

interface BuilderAssignPanelProps {
  storeIds: string[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  responseMode: ChecklistResponseMode;
  onResponseModeChange: (mode: ChecklistResponseMode) => void;
  people: StorePeople;
}

const MODES: { value: ChecklistResponseMode; title: string; hint: string; icon: ReactNode }[] = [
  { value: 'SHARED', title: 'One shared checklist', hint: 'One per store. When one person finishes it, it is done for everyone. The others do not have to fill it.', icon: <Users size={16} /> },
  { value: 'PER_DEPARTMENT', title: 'One per department', hint: 'Each department among the people chosen fills its own.', icon: <Building2 size={16} /> },
  { value: 'PER_USER', title: 'One per person', hint: 'Everyone chosen fills in their own copy.', icon: <User size={16} /> },
];

// Plain-language name of each response mode, shared with the Review step's "Who fills it" row.
// eslint-disable-next-line react-refresh/only-export-components
export const RESPONSE_MODE_TITLE: Record<ChecklistResponseMode, string> = Object.fromEntries(
  MODES.map((m) => [m.value, m.title]),
) as Record<ChecklistResponseMode, string>;

// Who fills this checklist in, and how many copies of it there are each time it comes round — real
// people only. The "Assign by role" chips that used to sit above this were a fixed list of made-up
// roles (Store Manager, Cashier…) that assigned nobody, so they're gone. Reviewers are their own
// step (BuilderReviewersPanel).
// What the choice means in numbers, for the people picked so far, so "how many copies" is not abstract.
const copiesSummary = (mode: ChecklistResponseMode, people: number, departments: number) => {
  if (people === 0) return 'Pick the people below to see how many copies this makes.';
  if (mode === 'SHARED') return `One copy for each store. ${people} ${people === 1 ? 'person' : 'people'} can fill it; the first to finish completes it for everyone.`;
  if (mode === 'PER_USER') return `${people} copies each time it comes round: every person fills and submits their own, and each is reviewed on its own.`;
  return `${departments} ${departments === 1 ? 'copy' : 'copies'} each time it comes round: one per department, shared by the people in that department.`;
};

export const BuilderAssignPanel = ({ storeIds, assigneeIds, onAssigneeIdsChange, responseMode, onResponseModeChange, people }: BuilderAssignPanelProps) => {
  const { data: users } = useAssignableUsersQuery(undefined, undefined, storeIds);
  // Only people the list below still shows count: someone picked for a store that was since
  // unticked is hidden there, and the server would reject them.
  const { shown, hidden } = splitByVisible(assigneeIds, people.storePersonIds);
  const storePersonIds = people.storePersonIds;
  const { hidden: gone } = splitByVisible(hidden, people.activePersonIds);
  const otherStore = hidden.length - gone.length;
  const hiddenMessage = [
    gone.length > 0 && `${peopleCount(gone.length)} left or ${gone.length === 1 ? 'was' : 'were'} deactivated`,
    otherStore > 0 && `${peopleCount(otherStore)} ${otherStore === 1 ? 'is' : 'are'} not in the selected stores`,
  ].filter(Boolean).join(', ') + '. Saving drops them.';
  const departmentCount = useMemo(() => {
    const picked = new Set(splitByVisible(assigneeIds, storePersonIds).shown);
    return new Set((users ?? []).filter(u => picked.has(u.id)).map(u => u.departmentId ?? 'none')).size;
  }, [users, assigneeIds, storePersonIds]);
  return (
  <div className="flex flex-col gap-5 sm:gap-6">
    {shown.length === 0 && (
      <NoticeBanner tone="warning" icon={PauseCircle}>
        Nobody picked yet. That is fine if their account is not ready: it is saved as a draft and goes live when you add them.
      </NoticeBanner>
    )}
    {hidden.length > 0 && (
      <HiddenPeopleNotice
        message={hiddenMessage}
        onRemove={() => onAssigneeIdsChange(shown)}
      />
    )}
    <ChecklistAssigneesField
      storeIds={storeIds}
      selected={shown}
      onChange={(ids) => onAssigneeIdsChange([...hidden, ...ids])}
    />
    <fieldset className="flex flex-col gap-2.5">
      <legend className="t-card font-display font-semibold text-text pb-1">How many copies?</legend>
      <div role="radiogroup" aria-label="How many copies" className="grid gap-2 sm:grid-cols-3 sm:gap-2.5">
        {MODES.map((m, index) => {
          const on = responseMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onResponseModeChange(m.value)}
              onKeyDown={(e) => onRadioKeyDown(e, index, MODES.length, (next) => onResponseModeChange(MODES[next].value))}
              className={`flex flex-col items-start gap-1 sm:gap-1.5 px-3 py-2.5 sm:p-3.5 text-left rounded-xl sm:rounded-2xl border cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                on
                  ? 'border-primary-500/60 bg-primary-500/10'
                  : 'border-border/60 bg-surface hover:border-border-hover'
              }`}
            >
              <span className={`flex items-center gap-2 text-sm font-display font-semibold ${on ? 'text-primary-700 dark:text-primary-300' : 'text-text'}`}>
                {m.icon}
                {m.title}
              </span>
              <span className={`t-meta font-display text-text-muted leading-relaxed ${on ? '' : 'max-sm:hidden'}`}>{m.hint}</span>
            </button>
          );
        })}
      </div>
      <NoticeBanner tone="info" icon={Users}>{copiesSummary(responseMode, shown.length, departmentCount)}</NoticeBanner>
    </fieldset>
  </div>
  );
};
