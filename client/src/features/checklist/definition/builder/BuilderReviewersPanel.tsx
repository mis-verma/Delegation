import { ChecklistReviewersField } from '../form/ChecklistReviewersField';
import { ShieldCheck } from 'lucide-react';
import { HiddenPeopleNotice } from './HiddenPeopleNotice';
import { BuilderSection } from './BuilderSection';
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
      <BuilderSection icon={ShieldCheck} title="Who reviews each run" hint="Optional. They approve or send back a filled-in run.">
      <ChecklistReviewersField
        hideTitle
        storeIds={storeIds}
        selected={reviewerIds}
        onChange={onReviewerIdsChange}
        isNew={isNew}
      />
      </BuilderSection>
    </div>
  );
};
