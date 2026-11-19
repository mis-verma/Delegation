import { ChecklistReviewersField } from '../form/ChecklistReviewersField';
import { ArrowRight, Crown, ShieldCheck } from 'lucide-react';
import { IconChip } from '../../../../components';
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
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2.5">
        <IconChip icon={Crown} tone="bg-primary-600" label="Department head" />
        <ArrowRight size={14} className="text-text-muted" aria-hidden />
        <IconChip icon={ShieldCheck} tone="bg-success" label="PC" />
        <span className="t-meta text-text-muted">Every run goes here automatically. When a department has no head, it goes straight to PC. People you add below can approve at any stage.</span>
      </div>
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
