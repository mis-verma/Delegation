import { ArrowLeft, ListChecks } from 'lucide-react';
import { Breadcrumbs, Button, PageHeader } from '../../../../components';
import { definitionState, STATE_LABEL } from '../definitionState';
import type { ChecklistDefinition } from '../../../../api/checklistDefinitions';

interface Props {
  isEditing: boolean;
  isCopying: boolean;
  existing?: ChecklistDefinition;
  copySource?: ChecklistDefinition;
  stepLabel: string;
  onBack: () => void;
}

export const BuilderHeader = ({ isEditing, isCopying, existing, copySource, stepLabel, onBack }: Props) => (
  <>
    <div className="hidden sm:block">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Admin', to: '/admin' },
          { label: 'Recurring Checklists', to: '/admin/scheduled-checklists' },
          { label: isEditing && existing ? existing.name : isCopying ? 'Duplicate Checklist' : 'New Checklist' },
          { label: stepLabel },
        ]}
      />
    </div>

    <div className="hidden sm:block">
      <PageHeader
        icon={ListChecks}
        title={isEditing ? `Editing: ${existing?.name}` : isCopying ? 'Duplicate Checklist' : 'New Checklist'}
        subtitle={
          isEditing && existing
            ? `Version ${existing.version} · ${existing.isActive ? `Live in ${existing.storeIds.length} store${existing.storeIds.length !== 1 ? 's' : ''}` : STATE_LABEL[definitionState(existing)]}`
            : isCopying && copySource
              ? `Copied from "${copySource.name}" with its stores, people, schedule and every question. Give it a new name, then save.`
              : 'Build a recurring checklist your team runs on a schedule.'
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onBack}
            className="font-display pointer-coarse:min-w-11"
            aria-label="Back to Recurring Checklists"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Back to Recurring Checklists</span>
          </Button>
        }
      />
    </div>
  </>
);
