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
  const { shown: active, hidden: inactive } = splitByVisible(reviewerIds, people.activePersonIds);
  return (
    <div className="flex flex-col gap-5">
      {inactive.length > 0 && (
        <HiddenPeopleNotice
          message={`${peopleCount(inactive.length)} ${inactive.length === 1 ? 'is' : 'are'} no longer active and can't review.`}
          onRemove={() => onReviewerIdsChange(active)}
        />
      )}
      <ChecklistReviewersField
        storeIds={storeIds}
        selected={reviewerIds}
        onChange={onReviewerIdsChange}
        isNew={isNew}
      />
    </div>
  );
};
