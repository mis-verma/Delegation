import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Modal } from '../../../../components';
import { AssigneeField } from '../../../assignees/AssigneeField';
import { useAssignableUsersQuery } from '../../hook';

export interface SectionSettings {
  floor: string | null;
  sectionOwnerId: string | null;
}

interface SectionSettingsDialogProps {
  open: boolean;
  section: string;
  value: SectionSettings;
  storeIds?: string[];
  onClose: () => void;
  onSave: (next: SectionSettings) => void;
}

const FLOOR_MAX = 120;

/**
 * The floor a section sits on, and the person answerable for it. Both belong to the whole
 * section, so they are set once here and written onto every question inside it.
 */
export const SectionSettingsDialog = ({ open, section, value, storeIds, onClose, onSave }: SectionSettingsDialogProps) => {
  const [floor, setFloor] = useState(value.floor ?? '');
  const [ownerId, setOwnerId] = useState(value.sectionOwnerId ?? '');
  const { data: users = [], isPending } = useAssignableUsersQuery(undefined, storeIds?.[0]);

  const save = () => {
    onSave({ floor: floor.trim() || null, sectionOwnerId: ownerId || null });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      icon={<Building2 className="size-5" />}
      title={`Settings for ${section}`}
      description="The floor this section sits on, and who answers for it. Both apply to every question in the section."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save section</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="section-floor" className="t-meta font-display font-semibold text-text-secondary">
            Floor
          </label>
          <input
            id="section-floor"
            type="text"
            value={floor}
            maxLength={FLOOR_MAX}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="For example: Floor 1, Ground, Basement"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base font-display text-text outline-none transition-colors duration-150 placeholder:text-text-light hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:h-10 sm:text-sm"
          />
          <p className="t-meta text-text-muted">
            Leave it blank for a checklist that is not split across floors.
          </p>
        </div>

        <AssigneeField
          single
          selectedIds={ownerId ? [ownerId] : []}
          onChange={(ids) => setOwnerId(ids[0] ?? '')}
          users={users}
          isLoading={isPending}
          pickerTitle="Who answers for this section"
          emptyText="No one to pick from"
        />
      </div>
    </Modal>
  );
};
