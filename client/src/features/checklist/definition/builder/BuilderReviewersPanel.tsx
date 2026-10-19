import { ChecklistReviewersField } from '../form/ChecklistReviewersField';
import { HiddenPeopleNotice } from './HiddenPeopleNotice';
import { peopleCount, splitByVisible, type StorePeople } from './useStorePeople';

interface BuilderReviewersPanelProps {
  storeIds: string[];
  reviewerIds: string[];
  onReviewerIdsChange: (ids: string[]) => void;
  people: StorePeople;
  /** A brand-new checklist, which starts with PC pre-selected. */
  isNew: boolean;
}

// Its own step, split out of "Assign" — who fills a checklist in and who reviews/approves it once
// filled are two different decisions, and bundling them under one "Assign" step made the reviewer
// picker easy to miss entirely. PC/Admin (and the department head of anyone assigned) can always
// approve or reject a run regardless of what's picked here — see ChecklistReviewersField — so this
// step has nothing to validate and never blocks moving on, even with no one picked.
//
// The picker only lists the checklist's stores, but a reviewer may work anywhere (PC, a corporate
// reviewer), so a reviewer outside the stores is valid and just flagged as not listed. One who is
// no longer active is dropped on save, so that one is a warning.
export const BuilderReviewersPanel = ({ storeIds, reviewerIds, onReviewerIdsChange, people, isNew }: BuilderReviewersPanelProps) => {
  const { shown, hidden } = splitByVisible(reviewerIds, people.storePersonIds);
  const { shown: activeHidden, hidden: inactive } = splitByVisible(hidden, people.activePersonIds);
  return (
    <div className="flex flex-col gap-5">
      {inactive.length > 0 && (
        <HiddenPeopleNotice
          message={`${peopleCount(inactive.length)} ${inactive.length === 1 ? 'is' : 'are'} no longer active and can't review.`}
          onRemove={() => onReviewerIdsChange([...shown, ...activeHidden])}
        />
      )}
      {activeHidden.length > 0 && (
        <HiddenPeopleNotice
          tone="info"
          message={`${peopleCount(activeHidden.length)} ${activeHidden.length === 1 ? 'works' : 'work'} outside the selected stores, so ${activeHidden.length === 1 ? 'is' : 'are'} not listed below. They still review this checklist.`}
          onRemove={() => onReviewerIdsChange([...shown, ...inactive])}
        />
      )}
      <ChecklistReviewersField
        storeIds={storeIds}
        selected={shown}
        totalSelected={reviewerIds.length}
        onChange={(ids) => onReviewerIdsChange([...hidden, ...ids])}
        isNew={isNew}
      />
    </div>
  );
};
