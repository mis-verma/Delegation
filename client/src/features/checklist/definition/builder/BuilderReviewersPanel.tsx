import { ChecklistReviewersField } from '../form/ChecklistReviewersField';
import { HiddenPeopleNotice } from './HiddenPeopleNotice';
import { peopleCount, splitByVisible, type StorePeople } from './useStorePeople';

interface BuilderReviewersPanelProps {
  storeIds: string[];
  reviewerIds: string[];
  onReviewerIdsChange: (ids: string[]) => void;
  people: StorePeople;
  isNew: boolean;
}

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
